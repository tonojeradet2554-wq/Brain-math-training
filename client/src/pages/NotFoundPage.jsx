import { Link } from 'react-router';
import { Compass } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext.jsx';
import { EmptyState } from '../components/States.jsx';

export default function NotFoundPage() {
  const { t } = useI18n();
  return (
    <div className="container page">
      <div className="card">
        <EmptyState
          icon={Compass}
          title={t('notFound.title')}
          action={
            <Link to="/" className="btn btn-primary btn-sm">
              {t('common.backToDashboard')}
            </Link>
          }
        >
          {t('notFound.body')}
        </EmptyState>
      </div>
    </div>
  );
}
