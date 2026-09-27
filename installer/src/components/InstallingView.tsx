import React from 'react';
import { ArcProgressBar } from './ArcProgressBar';
import { Language } from '../types';
import { t } from '../i18n';

interface InstallingViewProps {
  language: Language;
  isUpgrade: boolean;
  percent: number;
  stageMessage: string;
}

export const InstallingView: React.FC<InstallingViewProps> = ({
  language,
  isUpgrade,
  percent,
  stageMessage,
}) => {
  return (
    <div className="flex flex-col flex-1 px-6 py-6 justify-between select-none">
      <div className="text-center pt-2">
        <h2 className="text-lg font-bold text-white tracking-wide">
          {isUpgrade ? t(language, 'upgrading') : t(language, 'installing')}
        </h2>
      </div>

      <div className="flex flex-col items-center justify-center my-auto">
        <ArcProgressBar percent={percent} stageText={stageMessage} />
      </div>

      <div className="text-center pb-2">
        <p className="text-[11px] text-zinc-500">
          {language === 'ru'
            ? 'Пожалуйста, не закрывайте окно во время установки'
            : 'Please do not close this window during setup'}
        </p>
      </div>
    </div>
  );
};
