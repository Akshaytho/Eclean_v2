// Central navigation type definitions for the entire app.
// Import these in screens/navigators for type-safe navigation.

export type AuthStackParamList = {
  Splash:          undefined
  Onboarding:      undefined
  Login:           undefined
  Register:        undefined
  ForgotPassword:  undefined
}

// ─── Worker ──────────────────────────────────────────────────────────────────

export type WorkerTabParamList = {
  WorkerHome:  undefined
  FindWork:    undefined
  MyTasks:     undefined
  Dashboard:   undefined
}

export type WorkerStackParamList = {
  WorkerTabs:      undefined
  TaskDetail:      { taskId: string }
  ActiveTask:      { taskId: string }
  SubmitProof:     { taskId: string }
  Chat:            { taskId: string; title: string }
  Gallery:         undefined
  Wallet:          undefined
  Notifications:   undefined
}

// ─── Buyer ───────────────────────────────────────────────────────────────────

export type BuyerTabParamList = {
  BuyerHome:    undefined
  PostTask:     undefined
  BuyerTasks:   undefined
  Dashboard:    undefined
}

export type BuyerStackParamList = {
  BuyerTabs:         undefined
  BuyerTaskDetail:   { taskId: string }
  LiveTrack:         { taskId: string }
  Rating:            { taskId: string }
  Chat:              { taskId: string; title: string }
  Gallery:           undefined
  Notifications:     undefined
}

// ─── Supervisor ──────────────────────────────────────────────────────────────

export type SupervisorTabParamList = {
  SupervisorHome:  undefined
  Zones:           undefined
  Notifications:   undefined
  Profile:         undefined
}

export type SupervisorStackParamList = {
  SupervisorTabs:  undefined
  ZoneDetail:      { zoneId: string }
  InspectZone:     { zoneId: string }
}

// ─── Citizen ─────────────────────────────────────────────────────────────────

export type CitizenTabParamList = {
  CitizenHome:    undefined
  Notifications:  undefined
  Profile:        undefined
}

export type CitizenStackParamList = {
  CitizenTabs:   undefined
  CreateReport:  undefined
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export type RootStackParamList = {
  Auth:           undefined
  WorkerStack:    undefined
  BuyerStack:     undefined
  SupervisorStack: undefined
  CitizenStack:   undefined
}
