export type PassType = 'employee' | 'mosn' | 'temporary';
export interface EmployeePhoto { dataUrl: string; mimeType: string; width?: number; height?: number }
export interface EmployeeData { surname:string; name:string; patronymic?:string; fullName:string; employeeNumber?:string; position?:string; department?:string; comment?:string; accessProfile?:string; personalEntryPoint?:string; loginUser?:string; pin?:string; vehicleNumber?:string; photo?:EmployeePhoto }
export interface Settings { allowedOrigin:string; debug:boolean }
export const DEFAULT_SETTINGS: Settings = { allowedOrigin:'http://10.250.225.16', debug:false };
