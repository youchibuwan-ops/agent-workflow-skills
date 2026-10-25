// Shared conservative project-path policy, separate from source-bundle names.
const protectedNames=new Set(['.git','.codex','.dsh','.agents','.workflow-host','node_modules']);
export function protectedProjectSegment(segment){
 const name=segment.toLowerCase();
 return protectedNames.has(name)||/^(?:\.env(?:\..*)?|auth\.json|credentials(?:\..*)?)$/i.test(segment)
  ||(process.platform==='win32'&&(/[. ]$/.test(segment)||/~[1-9][0-9]*(?:\.|$)/.test(segment)||/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment)));
}
export const projectPathKey=path=>process.platform==='win32'?path.replaceAll('\\','/').toLowerCase():path.replaceAll('\\','/');
export const projectPathEquals=(a,b)=>projectPathKey(a)===projectPathKey(b);
