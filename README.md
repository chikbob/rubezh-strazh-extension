# RUBEZH STRAZH — локальная печать пропусков

Решение состоит из Manifest V3 расширения Яндекс Браузера и локального Windows Native Messaging Host. Персональные данные не отправляются в сеть и не сохраняются после закрытия окна подготовки.

## Простая установка расширения из релиза

1. На странице Releases скачайте `rubezh-strazh-extension-unpacked-vX.Y.Z.zip`.
2. Полностью распакуйте ZIP.
3. Откройте в Яндекс Браузере `browser://extensions`.
4. Включите режим разработчика.
5. Нажмите **«Загрузить распакованное расширение»**.
6. Выберите папку `rubezh-strazh-extension-unpacked` — файл `manifest.json` лежит непосредственно в ней.

Для этого способа не нужны Node.js, npm или сборка.

## Сборка расширения из исходников

```bash
npm install
npm run typecheck
npm run build
```

После загрузки на странице настроек укажите точный origin RUBEZH; расширение запросит доступ только к нему.

## Сборка и установка Windows-моста

```powershell
dotnet publish .\native-host\RubezhPrintBridge -c Release -o .\native-host\publish
powershell -ExecutionPolicy Bypass -File .\installer\install.ps1 -ExtensionId ID_РАСШИРЕНИЯ
```

Затем в настройках расширения нажмите «Проверить подключение», выберите точное имя очереди принтера и выполните тест на неперсональных данных. Диагностика ищет IDP SMART/SMART-51 и установленный `SmartComm2.dll`.

## Безопасность

Нет внешних библиотек runtime, CDN, аналитики, telemetry, HTTP-сервера или облачных API. Фото и данные живут только в памяти/`storage.session`. Native host принимает задания исключительно от зарегистрированного ID расширения.

Подробности формата и ограничения: [docs/RESEARCH.md](docs/RESEARCH.md).
