/**
 * Single source of truth for OpenAPI parity: every `operationId` in
 * `apps/docs/openapi/en/gateway.yaml` maps to exactly one dotted method path
 * on the `Codai` client. `operations.test.ts` parses the YAML and fails when
 * an operation is missing, mapped to a non-function, or when this table
 * carries a key the YAML does not have.
 */
export const OPERATION_METHODS: Record<string, string> = {
  // Chat & Completions
  createChatCompletion: 'chat.completions.create',
  createResponse: 'responses.create',
  createMessage: 'messages.create',
  // Embeddings & Audio
  createEmbeddings: 'embeddings.create',
  createSystemOne: 'systemOne.create',
  createTranscription: 'audio.transcribe',
  createSpeech: 'audio.speech',
  createEphemeralToken: 'tokens.create',
  // Models
  listModels: 'models.list',
  // Health
  getHealth: 'health.get',
  getHealthReady: 'health.ready',
  getStatus: 'health.status',
  // Agents
  runAgentSync: 'agents.run',
  createAgentRun: 'agents.runs.create',
  getAgentRunStats: 'agents.runs.stats',
  getAgentRun: 'agents.runs.get',
  listAgentRunSteps: 'agents.runs.steps',
  streamAgentRun: 'agents.runs.stream',
  cancelAgentRun: 'agents.runs.cancel',
  // Tools
  toolsSearch: 'tools.search',
  toolsFetch: 'tools.fetch',
  // Tasks
  listTasks: 'tasks.list',
  listPendingTasks: 'tasks.pending',
  getTaskStats: 'tasks.stats',
  getTask: 'tasks.get',
  confirmTask: 'tasks.confirm',
  // Event triggers + inbox
  listTriggers: 'triggers.list',
  createTrigger: 'triggers.create',
  updateTrigger: 'triggers.update',
  deleteTrigger: 'triggers.delete',
  rotateTriggerSecret: 'triggers.rotateSecret',
  setTriggerSecret: 'triggers.setSecret',
  testTrigger: 'triggers.test',
  listTriggerEvents: 'triggers.events',
  receiveTriggerHook: 'triggers.fireHook',
  listNotifications: 'notifications.list',
  markNotificationsRead: 'notifications.markRead',
  // Sessions
  createSession: 'sessions.create',
  listSessions: 'sessions.list',
  getSession: 'sessions.get',
  updateSession: 'sessions.update',
  deleteSession: 'sessions.delete',
  listSessionEvents: 'sessions.events.list',
  appendSessionEvents: 'sessions.events.append',
  listSessionControls: 'sessions.controls.list',
  submitSessionControl: 'sessions.controls.submit',
  markSessionControlApplied: 'sessions.controls.markApplied',
  dispatchToDevice: 'sessions.dispatch',
  claimSessionLease: 'sessions.lease.acquire',
  heartbeatSessionLease: 'sessions.lease.renew',
  releaseSessionLease: 'sessions.lease.release',
  streamSession: 'sessions.stream',
  // Devices
  getMyDispatchInbox: 'devices.dispatchInbox',
  listDevices: 'devices.list',
  updateDevice: 'devices.update',
  deleteDevice: 'devices.delete',
  // Hosts
  listHosts: 'hosts.list',
  streamHost: 'hosts.stream',
  execOnHost: 'hosts.exec',
  postHostExecResult: 'hosts.postResult',
  // Orgs & Sharing
  listSessionsSharedWithMe: 'sessions.shares.sharedWithMe',
  listSessionShares: 'sessions.shares.list',
  createSessionShare: 'sessions.shares.create',
  deleteSessionShare: 'sessions.shares.delete',
  createOrg: 'orgs.create',
  listOrgs: 'orgs.list',
  listOrgMembers: 'orgs.members.list',
  addOrgMember: 'orgs.members.add',
  removeOrgMember: 'orgs.members.remove',
  // Projects
  listProjects: 'projects.list',
  createProject: 'projects.create',
  getProject: 'projects.get',
  updateProject: 'projects.update',
  deleteProject: 'projects.delete',
  // Environments
  listEnvironments: 'environments.list',
  createEnvironment: 'environments.create',
  enrollEnvironment: 'environments.enroll',
  getEnvironment: 'environments.get',
  updateEnvironment: 'environments.update',
  startEnvironment: 'environments.start',
  stopEnvironment: 'environments.stop',
  archiveEnvironment: 'environments.archive',
  destroyEnvironment: 'environments.destroy',
  createEnvironmentEnrollToken: 'environments.enrollToken',
  listEnvironmentMembers: 'environments.members.list',
  addEnvironmentMember: 'environments.members.add',
  setMyEnvironmentSshKey: 'environments.members.setSshKey',
  setEnvironmentMemberRole: 'environments.members.setRole',
  removeEnvironmentMember: 'environments.members.remove',
  issueMyEnvironmentSshCert: 'environments.members.sshCert',
  getEnvironmentSshCa: 'environments.sshCa',
  listEnvironmentTasks: 'environments.tasks.list',
  createEnvironmentTask: 'environments.tasks.create',
  getEnvironmentTask: 'environments.tasks.get',
  listEnvironmentPorts: 'environments.ports.list',
  setEnvironmentPort: 'environments.ports.set',
  removeEnvironmentPort: 'environments.ports.remove',
  listEnvironmentSecrets: 'environments.secrets.list',
  setEnvironmentSecret: 'environments.secrets.set',
  removeEnvironmentSecret: 'environments.secrets.remove',
  // Account
  getAccount: 'account.get',
  patchAccount: 'account.update',
  getReceipt: 'receipt.get',
  submitFeedback: 'feedback.submit',
  listPhoneModels: 'phoneModels.list',
};

/** Operations whose SDK method is an async iterator (SSE-only endpoints). */
export const STREAMING_OPERATIONS: ReadonlySet<string> = new Set([
  'streamAgentRun',
  'streamSession',
  'streamHost',
]);
