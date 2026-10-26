using System;using System.Diagnostics;using System.Threading;using System.Windows.Forms;using System.Runtime.InteropServices;
[assembly: DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
[StructLayout(LayoutKind.Sequential,Pack=4)]internal struct K {internal Guid fmt;internal uint id;}
[StructLayout(LayoutKind.Explicit,Size=24)]internal struct V {[FieldOffset(0)]internal ushort vt;[FieldOffset(8)]internal IntPtr ptr;[FieldOffset(16)]internal IntPtr pad;}
[ComImport,Guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]internal interface S {
 [PreserveSig]int GetCount(out uint c);[PreserveSig]int GetAt(uint i,out K k);[PreserveSig]int GetValue(ref K k,out V v);[PreserveSig]int SetValue(ref K k,ref V v);[PreserveSig]int Commit();
}
internal static class OwnerFixture {
 [DllImport("shell32.dll",ExactSpelling=true)]static extern int SHGetPropertyStoreForWindow(IntPtr w,ref Guid id,[MarshalAs(UnmanagedType.Interface)]out S s);
 [DllImport("ole32.dll",ExactSpelling=true)]static extern int PropVariantClear(ref V v);
 [DllImport("kernel32.dll",ExactSpelling=true)]static extern uint WaitForSingleObject(IntPtr p,uint ms);
 [DllImport("kernel32.dll",ExactSpelling=true)]static extern int TerminateProcess(IntPtr p,uint exit);
 static string[] Expected={@@COMMAND@@,@@DISPLAY@@,@@ICON@@,"AgentWorkflow.Codex.Guarded"};static uint[] Ids={2,4,3,5};static bool pump;static string bridge,wrong,proxy;static uint pid;static IntPtr window;static int count;
 static bool Check(bool empty){return CheckWindow(window,empty);}
 static bool CheckWindow(IntPtr target,bool empty){Guid id=typeof(S).GUID;S s;Marshal.ThrowExceptionForHR(SHGetPropertyStoreForWindow(target,ref id,out s));try{for(int i=0;i<4;i++){var k=new K{fmt=new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"),id=Ids[i]};var v=new V();try{Marshal.ThrowExceptionForHR(s.GetValue(ref k,out v));if(empty?v.vt!=0:(v.vt!=31||Marshal.PtrToStringUni(v.ptr)!=Expected[i]))return false;}finally{Marshal.ThrowExceptionForHR(PropVariantClear(ref v));}}}finally{Marshal.FinalReleaseComObject(s);}return true;}
 static int Spawn(string exe,string args){var info=new ProcessStartInfo(exe,args){UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,RedirectStandardError=true};info.EnvironmentVariables.Clear();info.EnvironmentVariables["SystemRoot"]="C:\\Windows";info.EnvironmentVariables["WINDIR"]="C:\\Windows";info.EnvironmentVariables["PATH"]="C:\\Windows\\System32";using(var p=Process.Start(info)){var watch=Stopwatch.StartNew();if(pump){while(WaitForSingleObject(p.Handle,0)==258&&watch.ElapsedMilliseconds<3000){Application.DoEvents();Thread.Sleep(2);}}else WaitForSingleObject(p.Handle,3000);if(WaitForSingleObject(p.Handle,0)==258){TerminateProcess(p.Handle,199);WaitForSingleObject(p.Handle,1000);throw new Exception("fixture-held-child-timeout");}string stdout=p.StandardOutput.ReadToEnd(),stderr=p.StandardError.ReadToEnd();if(stdout.Length>4096||stderr.Length>0)throw new Exception("unexpected-child-output");return p.ExitCode;}}
 static string Args(string op,IntPtr handle,uint p){return op+" "+unchecked((ulong)handle.ToInt64()).ToString("x16")+" "+p;}
 static void Case(string name,int code,int expected,bool empty){if(code!=expected||!Check(empty))throw new Exception(name+"-failed:"+code);Console.WriteLine("PASS:"+name);count++;}
 [STAThread]static int Main(string[] args){try{if(args[0]=="proxy")return Spawn(args[1],args[2]+" "+args[3]+" "+args[4]);bridge=args[0];wrong=args[1];pump=args[2]=="pump";proxy=System.Reflection.Assembly.GetExecutingAssembly().Location;pid=(uint)Process.GetCurrentProcess().Id;using(var f=new Form()){f.ShowInTaskbar=false;window=f.Handle;if(f.Visible||!Check(true))throw new Exception("not-initially-hidden-empty");
 Case("set-fresh-store-golden",Spawn(bridge,Args("set",window,pid)),0,false);
 Case("verify-fresh-store-golden",Spawn(bridge,Args("verify",window,pid)),0,false);
 using(var child=new Control()){f.Controls.Add(child);IntPtr childWindow=child.Handle;if(!CheckWindow(childWindow,true))throw new Exception("child-not-empty");int childCode=Spawn(bridge,Args("set",childWindow,pid));bool rootKept=Check(false),childKept=CheckWindow(childWindow,true);Console.WriteLine("CHILD_RESULT:"+childCode+":ROOT_UNCHANGED="+rootKept+":CHILD_EMPTY="+childKept);if(childCode!=3||!rootKept||!childKept)throw new Exception("child-accepted:"+childCode);Console.WriteLine("PASS:child-top-level-rejection-both-stores-unchanged");count++;}
 Case("wrong-window-pid",Spawn(bridge,Args("set",window,pid+1)),4,false);
 Case("wrong-fixed-owner-image",Spawn(wrong,Args("set",window,pid)),4,false);
 Case("wrong-parent",Spawn(proxy,"proxy \""+bridge+"\" "+Args("set",window,pid)),4,false);
 Case("zero",Spawn(bridge,Args("set",IntPtr.Zero,pid)),3,false);
 IntPtr closed;using(var old=new Form()){closed=old.Handle;}Case("closed",Spawn(bridge,Args("set",closed,pid)),3,false);
 Case("arbitrary-operation",Spawn(bridge,Args("arbitrary",window,pid)),2,false);
 Case("clear-VT_EMPTY",Spawn(bridge,Args("clear",window,pid)),0,true);
 if(args.Length>3)Case("partial-write-exception-cleared",Spawn(args[3],Args("set",window,pid)),5,true);
 Case("verify-empty-is-not-valid-set",Spawn(bridge,Args("verify",window,pid)),5,true);
 }Console.WriteLine("COUNT:"+count);return 0;}catch(Exception e){Console.WriteLine("FAIL:"+e.GetType().Name+":"+e.Message);return 1;}}
}
