// Framework x64 only. Owner-specific values are injected by the trusted compiler.
using System;
using System.Globalization;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
[assembly: DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
internal sealed class BorrowedWindow : SafeHandleZeroOrMinusOneIsInvalid {
 internal BorrowedWindow(IntPtr value):base(false){SetHandle(value);}
 protected override bool ReleaseHandle(){return true;} // HWND belongs to Electron.
}
internal sealed class OwnedKernel : SafeHandleZeroOrMinusOneIsInvalid {
 private OwnedKernel():base(true){}
 protected override bool ReleaseHandle(){return Native.CloseHandle(handle)!=0;}
}
[StructLayout(LayoutKind.Sequential,Pack=4)] internal struct PropertyKey {internal Guid format;internal uint id;}
[StructLayout(LayoutKind.Explicit,Size=24)] internal struct PropVariant {
 [FieldOffset(0)]internal ushort type;[FieldOffset(8)]internal IntPtr pointer;[FieldOffset(16)]internal IntPtr padding;
}
[StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] internal struct ProcessEntry {
 internal uint size,usage,pid;internal UIntPtr heap;internal uint module,threads,parent;internal int priority;internal uint flags;
 [MarshalAs(UnmanagedType.ByValTStr,SizeConst=260)]internal string file;
}
[ComImport,Guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]internal interface PropertyStore {
 [PreserveSig]int GetCount(out uint count);[PreserveSig]int GetAt(uint index,out PropertyKey key);
 [PreserveSig]int GetValue(ref PropertyKey key,out PropVariant value);[PreserveSig]int SetValue(ref PropertyKey key,ref PropVariant value);[PreserveSig]int Commit();
}
internal static class Native {
 [DllImport("shell32.dll",ExactSpelling=true)]internal static extern int SHGetPropertyStoreForWindow(BorrowedWindow window,ref Guid iid,[MarshalAs(UnmanagedType.Interface)]out PropertyStore store);
 [DllImport("ole32.dll",ExactSpelling=true)]internal static extern int PropVariantClear(ref PropVariant value);
 [DllImport("user32.dll",ExactSpelling=true,SetLastError=true)]internal static extern uint GetWindowThreadProcessId(BorrowedWindow window,out uint pid);
 [DllImport("user32.dll",ExactSpelling=true)]internal static extern int IsWindow(BorrowedWindow window);
 [DllImport("user32.dll",ExactSpelling=true,SetLastError=true)]internal static extern IntPtr GetAncestor(BorrowedWindow window,uint flags);
 [DllImport("user32.dll",ExactSpelling=true,SetLastError=true)]internal static extern IntPtr GetWindowLongPtrW(BorrowedWindow window,int index);
 [DllImport("kernel32.dll",ExactSpelling=true)]internal static extern void SetLastError(uint error);
 [DllImport("kernel32.dll",ExactSpelling=true)]internal static extern uint GetCurrentProcessId();
 [DllImport("kernel32.dll",ExactSpelling=true,SetLastError=true)]internal static extern OwnedKernel OpenProcess(uint access,int inherit,uint pid);
 [DllImport("kernel32.dll",ExactSpelling=true,CharSet=CharSet.Unicode,SetLastError=true)]internal static extern int QueryFullProcessImageNameW(OwnedKernel process,uint flags,[Out]char[] path,ref uint length);
 [DllImport("kernel32.dll",ExactSpelling=true,SetLastError=true)]internal static extern OwnedKernel CreateToolhelp32Snapshot(uint flags,uint pid);
 [DllImport("kernel32.dll",ExactSpelling=true,CharSet=CharSet.Unicode,SetLastError=true)]internal static extern int Process32FirstW(OwnedKernel snapshot,ref ProcessEntry entry);
 [DllImport("kernel32.dll",ExactSpelling=true,CharSet=CharSet.Unicode,SetLastError=true)]internal static extern int Process32NextW(OwnedKernel snapshot,ref ProcessEntry entry);
 [DllImport("kernel32.dll",ExactSpelling=true,SetLastError=true)]internal static extern int CloseHandle(IntPtr handle);
}
internal static class Bridge {
 const string OwnerExecutable=@@OWNER@@;
 const string LauncherPath=@@LAUNCHER@@;
 const string IconPath=@@ICON@@;
 const string DisplayName=@@DISPLAY@@;
 const string AppId=@@APPID@@;
 static readonly uint[] Ids={2,4,3,5};
 static readonly string[] Values={"\""+LauncherPath+"\"",DisplayName,IconPath+",0",AppId};
 static PropertyKey Key(uint id){return new PropertyKey{format=new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"),id=id};}
 static uint ParentPid(){using(var snapshot=Native.CreateToolhelp32Snapshot(2,0)){if(snapshot.IsInvalid)throw new InvalidOperationException();var entry=new ProcessEntry{size=(uint)Marshal.SizeOf(typeof(ProcessEntry))};if(Native.Process32FirstW(snapshot,ref entry)==0)throw new InvalidOperationException();do{if(entry.pid==Native.GetCurrentProcessId())return entry.parent;}while(Native.Process32NextW(snapshot,ref entry)!=0);}throw new InvalidOperationException();}
 static void Validate(BorrowedWindow window,uint owner){uint pid;if(window.IsInvalid||Native.IsWindow(window)==0||Native.GetWindowThreadProcessId(window,out pid)==0)throw new ArgumentException();
  // x64 LONG_PTR is pointer-sized. Zero can be a legitimate value, so inspect
  // the captured last-error only after explicitly clearing the OS error slot.
  Native.SetLastError(0);IntPtr style=Native.GetWindowLongPtrW(window,-16);int styleError=Marshal.GetLastWin32Error();
  if((style==IntPtr.Zero&&styleError!=0)||(style.ToInt64()&0x40000000L)!=0||Native.GetAncestor(window,2)!=window.DangerousGetHandle())throw new ArgumentException();
  if(pid!=owner||ParentPid()!=owner)throw new UnauthorizedAccessException();using(var process=Native.OpenProcess(0x1000,0,owner)){if(process.IsInvalid)throw new UnauthorizedAccessException();uint count=32768;var path=new char[count];if(Native.QueryFullProcessImageNameW(process,0,path,ref count)==0||!String.Equals(new string(path,0,(int)count),OwnerExecutable,StringComparison.OrdinalIgnoreCase))throw new UnauthorizedAccessException();}}
 static PropertyStore Open(BorrowedWindow window){PropertyStore store;Guid iid=typeof(PropertyStore).GUID;Marshal.ThrowExceptionForHR(Native.SHGetPropertyStoreForWindow(window,ref iid,out store));return store;}
 static void Put(PropertyStore store,uint id,string text){var key=Key(id);var value=new PropVariant();if(text!=null){value.type=31;value.pointer=Marshal.StringToCoTaskMemUni(text);}try{Marshal.ThrowExceptionForHR(store.SetValue(ref key,ref value));}finally{Marshal.ThrowExceptionForHR(Native.PropVariantClear(ref value));}}
 static bool Verify(BorrowedWindow window,uint owner,bool empty){Validate(window,owner);var store=Open(window);try{for(int i=0;i<Ids.Length;i++){var key=Key(Ids[i]);var value=new PropVariant();try{Marshal.ThrowExceptionForHR(store.GetValue(ref key,out value));if(empty){if(value.type!=0)return false;}else if(value.type!=31||Marshal.PtrToStringUni(value.pointer)!=Values[i])return false;}finally{Marshal.ThrowExceptionForHR(Native.PropVariantClear(ref value));}}}finally{Marshal.FinalReleaseComObject(store);}Validate(window,owner);return true;}
 static void Write(BorrowedWindow window,uint owner,bool empty){Validate(window,owner);var store=Open(window);try{for(int i=0;i<Ids.Length;i++){Validate(window,owner);Put(store,Ids[i],empty?null:Values[i]);}}finally{Marshal.FinalReleaseComObject(store);}}
 [STAThread]static int Main(string[] args){BorrowedWindow window=null;uint owner=0;bool wrote=false,success=false;string operation=null;try{
  if(IntPtr.Size!=8||Marshal.SizeOf(typeof(PropertyKey))!=20||Marshal.SizeOf(typeof(PropVariant))!=24||Marshal.SizeOf(typeof(ProcessEntry))!=568||Marshal.OffsetOf(typeof(PropVariant),"pointer").ToInt32()!=8)return 10;
  ulong raw;if(args.Length!=3||args[1].Length!=16||!ulong.TryParse(args[1],NumberStyles.AllowHexSpecifier,CultureInfo.InvariantCulture,out raw)||!uint.TryParse(args[2],NumberStyles.None,CultureInfo.InvariantCulture,out owner)||owner==0)return 2;
  operation=args[0];if(operation!="set"&&operation!="verify"&&operation!="clear")return 2;
  window=new BorrowedWindow(new IntPtr(unchecked((long)raw)));Validate(window,owner);
  if(operation=="set"||operation=="clear"){wrote=true;Write(window,owner,operation=="clear");}
  if(!Verify(window,owner,operation=="clear"))throw new InvalidOperationException();
  success=true;Console.WriteLine("{\"ok\":true,\"operation\":\""+operation+"\",\"ownerPid\":"+owner.ToString(CultureInfo.InvariantCulture)+"}");return 0;
 }catch(ArgumentException){return 3;}catch(UnauthorizedAccessException){return 4;}catch{return 5;}finally{if(!success&&wrote&&window!=null)try{Write(window,owner,true);Verify(window,owner,true);}catch{}if(window!=null)window.Dispose();}}
}
