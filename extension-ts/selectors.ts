export const FIELD_LABELS: Record<string,string[]> = {
 surname:['Фамилия'], name:['Имя'], patronymic:['Отчество'], comment:['Комментарий'], employeeNumber:['Табельный номер'], position:['Должность'], department:['Отделение'], accessProfile:['Профиль доступа'], personalEntryPoint:['Личная точка прохода'], loginUser:['Пользователь для входа в систему'], pin:['Пин код','Пин-код'], vehicleNumber:['Номер автомобиля']
};
export const EMPLOYEE_ROOTS=['employee-view','[data-view="employee"]','.employee-view'];
export const PHOTO_SELECTORS=['employee-view img[src]','.employee-photo img[src]','img[alt*="сотрудник" i]','img[alt*="фото" i]','employee-view canvas'];
export const ACTION_SELECTORS=['employee-view button[title*="сохран" i]','employee-view button[type="submit"]','employee-view .panel-heading','.employee-view .panel-heading'];
