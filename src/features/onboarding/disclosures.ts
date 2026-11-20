export type DisclosureCopy = {
  key: string
  version: number
  title: string
  body: string
}

export const DISCLOSURES = {
  tasks: {
    key: 'tasks_ai_processing',
    version: 1,
    title: 'About AI image processing',
    body: 'This page can send screenshots you attach to Anthropic’s Claude API to fill in the requester and task. Those images are not saved in Miravize. We cannot guarantee confidentiality once a third party processes them. For sensitive information, skip screenshot processing.',
  },
  requests: {
    key: 'requests_ai_processing',
    version: 1,
    title: 'About AI image processing',
    body: 'This page can send screenshots you attach to Anthropic’s Claude API to fill in the requester and request. Those images are not saved in Miravize. We cannot guarantee confidentiality once a third party processes them. For sensitive information, skip screenshot processing.',
  },
  reports: {
    key: 'reports_ai_processing',
    version: 1,
    title: 'About AI-generated reports',
    body: '**Written Reports** and **Complete Reports** use Anthropic’s Claude API to analyze your work records and generate summaries. This sends descriptions, clients, projects, tasks, and requests to the AI provider. If you prefer not to use AI processing, choose **Export PDF** or **Export CSV** instead.',
  },
} as const satisfies Record<string, DisclosureCopy>
