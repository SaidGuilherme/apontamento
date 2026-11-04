import type { ImportItem } from './api'

/** A linha precisa de Completed Work maior que zero para entrar no xlsx e no Redmine. */
export const needsHours = (i: ImportItem) => i.completedWork == null || i.completedWork <= 0
