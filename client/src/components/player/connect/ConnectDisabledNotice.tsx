import { Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function ConnectDisabledNotice() {
  const { t } = useTranslation();

  return (
    <div className="px-3.5 py-3 mx-2 my-2 bg-primary/10 border border-primary/20 rounded-xl space-y-1">
      <div className="flex items-center gap-1.5 font-bold text-xs text-primary">
        <Info size={14} className="shrink-0" />
        <span>{t('holad_connect.disabled_title', 'Автономный режим')}</span>
      </div>
      <p className="text-[11px] leading-relaxed text-secondary">
        {t('holad_connect.disabled_desc', 'К сожалению, функция удалённого управления временно отключена из-за проблем с Holad Connect. Плеер работает автономно.')}
      </p>
    </div>
  );
}
