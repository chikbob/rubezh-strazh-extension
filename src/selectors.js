export const FIELD_LABELS = {
    surname: ['Фамилия'], name: ['Имя'], patronymic: ['Отчество'], comment: ['Комментарий'], employeeNumber: ['Табельный номер'], position: ['Должность'], department: ['Отделение'], accessProfile: ['Профиль доступа'], personalEntryPoint: ['Личная точка прохода'], loginUser: ['Пользователь для входа в систему'], pin: ['Пин код', 'Пин-код'], vehicleNumber: ['Номер автомобиля']
};
export const EMPLOYEE_ROOTS = ['employee_view', 'employee-view', '[data-view="employee"]', '.employee-view'];
export const PHOTO_SELECTORS = ['employee_view img[src]', 'employee-view img[src]', '.employee-photo img[src]', 'img[alt*="сотрудник" i]', 'img[alt*="фото" i]', 'employee_view canvas', 'employee-view canvas'];
const VIEW_ROOTS = ['employee_view', 'employee-view', '.employee-view'];
const ACTIONS = ['button[title*="сохран" i]', 'button[aria-label*="сохран" i]', 'button:has(.fa-save)', 'button:has(.fa-floppy-o)', 'button:has(.glyphicon-floppy-disk)', 'button:has(.glyphicon-floppy-save)', 'button:has([class*="save"])', 'button[type="submit"]'];
export const ACTION_SELECTORS = VIEW_ROOTS.flatMap(root => ACTIONS.map(action => `${root} ${action}`));
