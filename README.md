# RUBEZH STRAZH — локальная печать пропусков

Решение состоит из Manifest V3 расширения Яндекс Браузера и локального Windows Native Messaging Host. Персональные данные не отправляются в сеть и не сохраняются после закрытия окна подготовки.

## Сборка расширения

```bash
npm install
npm run typecheck
npm run build
```

В Яндекс Браузере откройте `browser://extensions`, включите режим разработчика и загрузите корень проекта как распакованное расширение. На странице настроек укажите точный origin RUBEZH; расширение запросит доступ только к нему.

## Сборка и установка Windows-моста

```powershell
dotnet publish .\native-host\RubezhPrintBridge -c Release -o .\native-host\publish
powershell -ExecutionPolicy Bypass -File .\installer\install.ps1 -ExtensionId ID_РАСШИРЕНИЯ
```

Затем в настройках расширения нажмите «Проверить подключение», выберите точное имя очереди принтера и выполните тест на неперсональных данных. Диагностика ищет IDP SMART/SMART-51 и установленный `SmartComm2.dll`.

## Безопасность

Нет внешних библиотек runtime, CDN, аналитики, telemetry, HTTP-сервера или облачных API. Фото и данные живут только в памяти/`storage.session`. Native host принимает задания исключительно от зарегистрированного ID расширения.

Подробности формата и ограничения: [docs/RESEARCH.md](docs/RESEARCH.md).
