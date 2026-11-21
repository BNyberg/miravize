import { describe, expect, it } from 'vitest'

import { applyProject, displayClientIds, emptyAssignment, type RequestCatalog } from './request-assignment'

function catalog(): RequestCatalog {
  return {
    projects: [],
    activities: [
      {
        id: 'default',
        workspace_id: 'w',
        project_id: 'site',
        client_id: null,
        name: 'General',
        is_default: true,
      },
    ],
    clients: [],
    projectClients: [
      { id: '1', workspace_id: 'w', project_id: 'site', client_id: 'north', split_percent: 60, hourly_rate: null },
      { id: '2', workspace_id: 'w', project_id: 'site', client_id: 'south', split_percent: 40, hourly_rate: null },
      { id: '3', workspace_id: 'w', project_id: 'manual', client_id: 'north', split_percent: null, hourly_rate: null },
    ],
    aliases: [],
  }
}

describe('request assignment', () => {
  it('fills split clients and the default activity when a project is chosen', () => {
    const next = applyProject(emptyAssignment(), 'site', catalog())
    expect(next.activityId).toBe('default')
    expect(next.clientIds.sort()).toEqual(['north', 'south'])
  })

  it('keeps only clients that belong to a manual project', () => {
    const current = { ...emptyAssignment(), clientIds: ['north', 'other'] }
    const next = applyProject(current, 'manual', catalog())
    expect(next.clientIds).toEqual(['north'])
    expect(next.activityId).toBe('')
  })

  it('prefers stored clients over the project split', () => {
    const row = { project_id: 'site', request_clients: [{ client_id: 'stored' }] }
    expect(displayClientIds(row, catalog())).toEqual(['stored'])
    expect(displayClientIds({ project_id: 'site' }, catalog()).sort()).toEqual(['north', 'south'])
  })
})
