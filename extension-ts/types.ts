export type PassType = 'employee' | 'mosn' | 'temporary';
export interface EmployeePhoto { dataUrl: string; mimeType: string; width?: number; height?: number }
export interface EmployeeData { surname:string; name:string; patronymic?:string; fullName:string; employeeNumber?:string; position?:string; department?:string; comment?:string; accessProfile?:string; personalEntryPoint?:string; loginUser?:string; pin?:string; vehicleNumber?:string; photo?:EmployeePhoto }
export interface PrintJob { type:PassType; employee:EmployeeData; displayValues:{fullName?:string;position?:string;department?:string}; printer:string; copies:number; imageDataUrl:string; dpi:number }
export interface Settings { allowedOrigin:string; printer:string; autoNormalize:boolean; showPreview:boolean; debug:boolean; templates:Record<PassType,string> }
export const DEFAULT_SETTINGS: Settings = { allowedOrigin:'http://10.250.225.16', printer:'', autoNormalize:true, showPreview:true, debug:false, templates:{employee:'Встроенный',mosn:'Встроенный',temporary:'Встроенный'} };
