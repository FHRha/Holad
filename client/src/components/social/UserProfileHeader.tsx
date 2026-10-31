import { useTranslation } from 'react-i18next';
import { Copy, Check } from 'lucide-react';

export interface UserProfileHeaderProps {
  currentNick: string;
  displayTag: string;
  isTagCopied: boolean;
  onCopyTag: () => void;
  variant?: 'sidebar' | 'view' | 'modal';
}

export default function UserProfileHeader({
  currentNick,
  displayTag,
  isTagCopied,
  onCopyTag,
  variant = 'view',
}: UserProfileHeaderProps) {
  const { t } = useTranslation();

  const firstLetter = (currentNick.charAt(0) || 'U').toUpperCase();

  if (variant === 'sidebar') {
    return (
      <div className="flex items-center justify-between p-2.5 bg-neutral-100 dark:bg-[#141414] rounded-xl">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-full bg-primary/15 text-primary font-bold flex items-center justify-center text-xs shrink-0 ring-1 ring-primary/25">
            {firstLetter}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[10px] text-secondary uppercase font-semibold tracking-wider">
              {t('social.my_tag', 'Мой тег')}
            </span>
            <span className="font-mono font-bold text-xs text-foreground truncate">{displayTag}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onCopyTag}
          className="p-1.5 px-2.5 rounded-lg bg-neutral-200/70 dark:bg-[#1e1e1e] hover:bg-neutral-200 dark:hover:bg-[#262626] text-secondary hover:text-foreground transition-all flex items-center gap-1.5 text-xs font-medium shrink-0"
          title={t('social.copy_tag', 'Скопировать тег')}
        >
          {isTagCopied ? <Check size={13} className="text-primary" /> : <Copy size={13} />}
          <span>{isTagCopied ? t('social.tag_copied', 'Скопирован!') : t('social.copy_tag', 'Копировать')}</span>
        </button>
      </div>
    );
  }

  if (variant === 'modal') {
    return (
      <div className="flex items-center justify-between p-3 bg-[#1e1e1e] border border-white/5 rounded-2xl shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-full bg-primary/20 text-primary font-bold flex items-center justify-center text-sm shrink-0 ring-1 ring-primary/30">
            {firstLetter}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[10px] text-secondary uppercase font-bold tracking-wider">
              {t('social.my_tag', 'Мой тег')}
            </span>
            <span className="font-mono font-bold text-sm text-foreground truncate">{displayTag}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onCopyTag}
          className="p-2 px-3 rounded-xl bg-[#282828] hover:bg-[#323232] text-foreground transition-all flex items-center gap-1.5 text-xs font-semibold shrink-0 active:scale-95"
          title={t('social.copy_tag', 'Скопировать тег')}
        >
          {isTagCopied ? <Check size={14} className="text-primary" /> : <Copy size={14} />}
          <span>{isTagCopied ? t('social.tag_copied', 'Скопирован!') : t('social.copy_tag', 'Копировать')}</span>
        </button>
      </div>
    );
  }

  // variant === 'view'
  return (
    <div className="flex items-center justify-between p-4 bg-card border border-border rounded-2xl shadow-sm">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-11 h-11 rounded-full bg-primary/20 text-primary font-bold flex items-center justify-center text-base shrink-0 ring-1 ring-primary/30">
          {firstLetter}
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-[10px] text-secondary uppercase font-bold tracking-wider">
            {t('social.my_tag', 'Мой тег')}
          </span>
          <span className="font-mono font-bold text-sm md:text-base text-foreground truncate">{displayTag}</span>
        </div>
      </div>
      <button
        type="button"
        onClick={onCopyTag}
        className="p-2.5 px-4 rounded-xl bg-foreground/10 hover:bg-foreground/15 text-foreground transition-all flex items-center gap-2 text-xs font-bold shrink-0 active:scale-95 shadow-sm"
        title={t('social.copy_tag', 'Скопировать тег')}
      >
        {isTagCopied ? <Check size={16} className="text-primary" /> : <Copy size={16} />}
        <span>{isTagCopied ? t('social.tag_copied', 'Скопирован!') : t('social.copy_tag', 'Копировать')}</span>
      </button>
    </div>
  );
}
