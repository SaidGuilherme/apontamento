// Tipos e chamadas da API do backend (.NET). Os nomes seguem os DTOs em camelCase.

export type RedmineStatus = 'Pending' | 'Sent' | 'Error'
export type PreviewStatus = 'Ready' | 'Sent' | 'Error' | 'Duplicate' | 'Incomplete'

export interface Settings {
  redmineUrl: string | null
  hasApiKey: boolean
  redmineIgnoreSslErrors: boolean
  defaultProjectName: string
  defaultRedmineProjectId: number | null
  defaultRedmineProjectName: string | null
  defaultIssueId: number | null
  defaultIssueSubject: string | null
  defaultActivityId: number | null
  defaultActivityName: string | null
}

export interface UpdateSettings extends Omit<Settings, 'hasApiKey'> {
  redmineApiKey: string | null
  clearApiKey: boolean
}

export interface TaskType {
  id: number
  name: string
  sortOrder: number
}

export interface ImportSummary {
  id: number
  fileName: string
  createdAt: string
  itemCount: number
  totalHours: number
  missingHoursCount: number
  sentCount: number
  errorCount: number
}

export interface ImportItem {
  id: number
  rowNumber: number
  project: string
  workItemId: number
  workItemType: string
  taskType: string | null
  title: string
  completedWork: number | null
  assignedTo: string
  state: string
  closedDate: string | null
  spentOn: string | null
  redmineIssueId: number | null
  redmineStatus: RedmineStatus
  redmineTimeEntryId: number | null
  redmineSentIssueId: number | null
  redmineError: string | null
  redmineSentAt: string | null
}

export interface ImportData {
  id: number
  fileName: string
  createdAt: string
  issueId: number | null
  issueSubject: string | null
  items: ImportItem[]
}

export interface RedminePreviewItem {
  itemId: number
  rowNumber: number
  workItemId: number
  title: string
  comment: string
  spentOn: string | null
  hours: number | null
  issueId: number | null
  issueIsOverride: boolean
  status: PreviewStatus
  canSend: boolean
  problems: string[]
  timeEntryId: number | null
  error: string | null
  duplicateOfImportId: number | null
}

export interface RedminePreview {
  configured: boolean
  redmineUrl: string | null
  activityId: number | null
  activityName: string | null
  defaultIssueId: number | null
  defaultIssueSubject: string | null
  globalProblems: string[]
  totalHours: number
  readyCount: number
  readyHours: number
  items: RedminePreviewItem[]
}

export interface SendResult {
  sent: number
  failed: number
  preview: RedminePreview
}

export interface RedmineProject {
  id: number
  name: string
  identifier: string
  parentName: string | null
}

export interface RedmineActivity {
  id: number
  name: string
  isDefault: boolean
}

export interface RedmineIssue {
  id: number
  subject: string
  projectName: string | null
  statusName: string | null
  trackerName: string | null
}

export interface RedmineUser {
  userId: number
  login: string
  name: string
}

export class ApiError extends Error {
  status: number
  details: string[]

  constructor(message: string, status: number, details: string[] = []) {
    super(message)
    this.status = status
    this.details = details
  }
}

async function readError(res: Response): Promise<ApiError> {
  let title = `Erro ${res.status} ao falar com a API.`
  let details: string[] = []
  try {
    const body = await res.json()
    if (typeof body?.title === 'string') title = body.title
    if (Array.isArray(body?.details)) details = body.details
  } catch {
    // resposta sem JSON
  }
  return new ApiError(title, res.status, details)
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json')

  let res: Response
  try {
    res = await fetch(`/api${path}`, { ...init, headers })
  } catch {
    throw new ApiError('Não foi possível falar com a API. Confira se os containers estão rodando.', 0)
  }

  if (!res.ok) throw await readError(res)
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

const json = (body: unknown) => JSON.stringify(body)

function fileNameFrom(disposition: string | null, fallback: string): string {
  if (!disposition) return fallback
  const star = /filename\*=UTF-8''([^;]+)/i.exec(disposition)
  if (star) return decodeURIComponent(star[1])
  const plain = /filename="?([^";]+)"?/i.exec(disposition)
  return plain ? plain[1] : fallback
}

export const api = {
  getSettings: () => request<Settings>('/settings'),
  saveSettings: (s: UpdateSettings) => request<Settings>('/settings', { method: 'PUT', body: json(s) }),
  testRedmine: (body: { redmineUrl: string | null; redmineApiKey: string | null; redmineIgnoreSslErrors: boolean }) =>
    request<RedmineUser>('/settings/redmine/test', { method: 'POST', body: json(body) }),

  getTaskTypes: () => request<TaskType[]>('/task-types'),
  createTaskType: (name: string) => request<TaskType>('/task-types', { method: 'POST', body: json({ name }) }),
  updateTaskType: (id: number, name: string, sortOrder?: number) =>
    request<TaskType>(`/task-types/${id}`, { method: 'PUT', body: json({ name, sortOrder }) }),
  deleteTaskType: (id: number) => request<void>(`/task-types/${id}`, { method: 'DELETE' }),

  getRedmineProjects: () => request<RedmineProject[]>('/redmine/projects'),
  getRedmineActivities: () => request<RedmineActivity[]>('/redmine/activities'),
  searchRedmineIssues: (projectId: number | null, q: string) => {
    const params = new URLSearchParams()
    if (projectId) params.set('projectId', String(projectId))
    if (q.trim()) params.set('q', q.trim())
    return request<RedmineIssue[]>(`/redmine/issues?${params}`)
  },
  getRedmineIssue: (id: number) => request<RedmineIssue>(`/redmine/issues/${id}`),

  listImports: () => request<ImportSummary[]>('/imports'),
  uploadCsv: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<ImportData>('/imports', { method: 'POST', body: form })
  },
  getImport: (id: number) => request<ImportData>(`/imports/${id}`),
  saveImport: (id: number, data: ImportData) =>
    request<ImportData>(`/imports/${id}`, {
      method: 'PUT',
      body: json({ issueId: data.issueId, issueSubject: data.issueSubject, items: data.items }),
    }),
  deleteImport: (id: number) => request<void>(`/imports/${id}`, { method: 'DELETE' }),
  deleteImportItem: (id: number, itemId: number) =>
    request<ImportData>(`/imports/${id}/items/${itemId}`, { method: 'DELETE' }),

  downloadXlsx: async (id: number, fallbackName: string) => {
    let res: Response
    try {
      res = await fetch(`/api/imports/${id}/xlsx`)
    } catch {
      throw new ApiError('Não foi possível falar com a API. Confira se os containers estão rodando.', 0)
    }
    if (!res.ok) throw await readError(res)
    const blob = await res.blob()
    const name = fileNameFrom(res.headers.get('Content-Disposition'), fallbackName)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    return name
  },

  getRedminePreview: (id: number) => request<RedminePreview>(`/imports/${id}/redmine`),
  sendToRedmine: (id: number, itemIds: number[]) =>
    request<SendResult>(`/imports/${id}/redmine/send`, { method: 'POST', body: json({ itemIds }) }),
}
