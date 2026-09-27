import { Language } from './types';

export const translations = {
  en: {
    appTitle: 'Holad Setup',
    install: 'Install',
    installing: 'Installing...',
    upgrading: 'Upgrading...',
    upgrade: 'Upgrade',
    autoUpdate: 'Auto-update',
    autoUpdateTooltip: 'Update silently in the background',
    versionBadge: 'v{{version}}',
    currentVersion: 'Installed',
    newVersion: 'New version',
    advancedOptions: 'Installation options',
    installPath: 'Installation path',
    musicPath: 'Music download folder',
    browse: 'Browse...',
    desktopShortcut: 'Create Desktop shortcut',
    startMenuShortcut: 'Create Start Menu shortcut',
    autostart: 'Launch on Windows startup',
    detectedPathNotice: 'Existing installation found at this location',
    
    // Progress stages
    stageStopping: 'Closing running Holad instance...',
    stageExtracting: 'Extracting program files...',
    stageRegistry: 'Registering application...',
    stageShortcuts: 'Configuring shortcuts...',
    stageComplete: 'Done!',

    // Finished
    successTitle: 'Ready to Play',
    successCleanDesc: 'Holad has been installed successfully.',
    successUpgradeDesc: 'Holad has been upgraded to the latest version.',
    launchApp: 'Launch Holad',
    finish: 'Finish',

    // Error
    errorTitle: 'Installation Failed',
    retry: 'Retry',
    close: 'Close',

    // Uninstall
    uninstallTitle: 'Uninstall Holad',
    uninstallDesc: 'Are you sure you want to remove Holad from your computer?',
    deleteUserData: 'Delete user settings and cached data',
    uninstallBtn: 'Uninstall Holad',
    uninstallSuccessTitle: 'Holad Uninstalled',
    uninstallSuccessDesc: 'Holad has been successfully removed from your computer.',
    cancel: 'Cancel',
  },
  ru: {
    appTitle: 'Установка Holad',
    install: 'Установить',
    installing: 'Установка...',
    upgrading: 'Обновление...',
    upgrade: 'Обновить',
    autoUpdate: 'Автообновление',
    autoUpdateTooltip: 'Тихое фоновое обновление без лишних окон',
    versionBadge: 'v{{version}}',
    currentVersion: 'Установлена',
    newVersion: 'Новая версия',
    advancedOptions: 'Параметры установки',
    installPath: 'Путь установки',
    musicPath: 'Папка для скачанной музыки',
    browse: 'Обзор...',
    desktopShortcut: 'Ярлык на рабочем столе',
    startMenuShortcut: 'Ярлык в меню «Пуск»',
    autostart: 'Автозапуск при входе в Windows',
    detectedPathNotice: 'Обнаружена предыдущая установка в этой папке',

    // Progress stages
    stageStopping: 'Завершение работающего процесса Holad...',
    stageExtracting: 'Распаковка файлов программы...',
    stageRegistry: 'Регистрация приложения в системе...',
    stageShortcuts: 'Создание ярлыков...',
    stageComplete: 'Готово!',

    // Finished
    successTitle: 'Всё готово к прослушиванию',
    successCleanDesc: 'Holad успешно установлен на ваш компьютер.',
    successUpgradeDesc: 'Holad успешно обновлен до актуальной версии.',
    launchApp: 'Запустить Holad',
    finish: 'Завершить',

    // Error
    errorTitle: 'Ошибка установки',
    retry: 'Повторить',
    close: 'Закрыть',

    // Uninstall
    uninstallTitle: 'Удаление Holad',
    uninstallDesc: 'Вы действительно хотите удалить Holad с этого компьютера?',
    deleteUserData: 'Удалить настройки и кэш приложения',
    uninstallBtn: 'Удалить Holad',
    uninstallSuccessTitle: 'Holad успешно удалён',
    uninstallSuccessDesc: 'Приложение Holad было полностью удалено с вашего компьютера.',
    cancel: 'Отмена',
  }
} as const;

export type TranslationKey = keyof typeof translations.en;

export function t(lang: Language, key: TranslationKey, params?: Record<string, string>): string {
  const dict = translations[lang] || translations.en;
  let text: string = dict[key] || translations.en[key] || key;
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      text = text.replace(new RegExp(`{{${k}}}`, 'g'), v);
    });
  }
  return text;
}
