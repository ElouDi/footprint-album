// TS DOM lib 尚未收录的 File System Access API 权限方法（Chrome/Edge 支持）
interface FileSystemFileHandle {
  queryPermission?(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<'granted' | 'denied' | 'prompt'>
  requestPermission?(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<'granted' | 'denied' | 'prompt'>
}
