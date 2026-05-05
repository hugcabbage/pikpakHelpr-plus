/**
 * 格式化字节数为可读字符串
 */
export function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes'

  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}

/**
 * 根据当前排序方式格式化文件信息显示
 */
export function formatFileInfo(item, sortBy) {
  switch (sortBy) {
    case 'size':
      return item.size ? formatBytes(parseInt(item.size)) : 'N/A'
    case 'created_time':
      return item.created_time ? new Date(item.created_time).toLocaleString() : 'N/A'
    case 'modified_time':
      return item.modified_time ? new Date(item.modified_time).toLocaleString() : 'N/A'
    case 'file_category':
      return item.file_category || 'N/A'
    default:
      return ''
  }
}
