'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import styles from './Header.module.css';

const announcementKeys = ['announcement1', 'announcement2', 'announcement3'] as const;

export function AnnouncementBar() {
  const t = useTranslations('Header');
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setMessageIndex((index) => (index + 1) % announcementKeys.length);
    }, 4_000);

    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <aside className={styles.announcement} aria-label={t('announcements')}>
      <p className={styles.announcementMessage} key={announcementKeys[messageIndex]}>
        {t(announcementKeys[messageIndex])}
      </p>
    </aside>
  );
}
