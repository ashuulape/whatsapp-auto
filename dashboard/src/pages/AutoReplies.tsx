import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Check, Loader2, MessageCircle, Pencil, Plus, Trash2, Zap } from 'lucide-react';
import type { AutomationRule, WebhookFilterCondition } from '../services/api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useRole } from '../hooks/useRole';
import { useToast } from '../hooks/useToast';
import {
  useAutomationRulesQuery,
  useCreateAutomationRuleMutation,
  useDeleteAutomationRuleMutation,
  useSessionsQuery,
  useUpdateAutomationRuleMutation,
} from '../hooks/queries';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import './AutoReplies.css';

type Draft = {
  name: string;
  keyword: string;
  operator: 'contains' | 'equals';
  replyText: string;
  cooldownSeconds: number;
};

const emptyDraft: Draft = { name: '', keyword: '', operator: 'contains', replyText: '', cooldownSeconds: 60 };

function bodyCondition(rule: AutomationRule): WebhookFilterCondition | undefined {
  return rule.conditions?.conditions.find(condition => condition.field === 'body');
}

function draftFromRule(rule: AutomationRule): Draft {
  const condition = bodyCondition(rule);
  return {
    name: rule.name,
    keyword: typeof condition?.value === 'string' ? condition.value : '',
    operator: condition?.operator === 'equals' ? 'equals' : 'contains',
    replyText: rule.replyText,
    cooldownSeconds: rule.cooldownSeconds,
  };
}

export function AutoReplies() {
  const { t } = useTranslation();
  useDocumentTitle(t('autoReplies.title'));
  const { canWrite } = useRole();
  const toast = useToast();
  const { data: sessions = [], isLoading: loadingSessions, error: sessionsError } = useSessionsQuery();
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AutomationRule | null>(null);

  const sessionsFailed = !!sessionsError && sessions.length === 0;
  const { data: rules = [], isLoading: loadingRules, error: rulesError } = useAutomationRulesQuery(
    selectedSessionId,
    canWrite,
  );
  const createMutation = useCreateAutomationRuleMutation();
  const updateMutation = useUpdateAutomationRuleMutation();
  const deleteMutation = useDeleteAutomationRuleMutation();
  const isSaving = createMutation.isPending || updateMutation.isPending;

  useEffect(() => {
    if (sessions.some(session => session.id === selectedSessionId)) return;
    setSelectedSessionId(sessions[0]?.id ?? '');
  }, [selectedSessionId, sessions]);

  const openCreate = () => {
    setEditingRule(null);
    setDraft(emptyDraft);
    setModalOpen(true);
  };

  const openEdit = (rule: AutomationRule) => {
    setEditingRule(rule);
    setDraft(draftFromRule(rule));
    setModalOpen(true);
  };

  const closeModal = () => {
    if (isSaving) return;
    setModalOpen(false);
    setEditingRule(null);
  };

  const saveRule = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedSessionId || !draft.name.trim() || !draft.keyword.trim() || !draft.replyText.trim()) return;

    const otherConditions = (editingRule?.conditions?.conditions ?? []).filter(condition => condition.field !== 'body');
    const conditions = {
      conditions: [
        ...otherConditions,
        {
          field: 'body',
          operator: draft.operator,
          value: draft.keyword.trim(),
          caseSensitive: false,
        } satisfies WebhookFilterCondition,
      ],
    };
    const data = {
      name: draft.name.trim(),
      replyText: draft.replyText.trim(),
      cooldownSeconds: draft.cooldownSeconds,
      conditions,
    };

    try {
      if (editingRule) {
        await updateMutation.mutateAsync({ sessionId: selectedSessionId, id: editingRule.id, data });
        toast.success(t('autoReplies.toasts.updated'));
      } else {
        await createMutation.mutateAsync({ sessionId: selectedSessionId, data });
        toast.success(t('autoReplies.toasts.created'));
      }
      setModalOpen(false);
      setEditingRule(null);
    } catch (error) {
      toast.error(
        t(editingRule ? 'autoReplies.toasts.updateFailed' : 'autoReplies.toasts.createFailed', {
          message: error instanceof Error ? error.message : t('common.unknownError'),
        }),
      );
    }
  };

  const toggleRule = async (rule: AutomationRule) => {
    try {
      await updateMutation.mutateAsync({
        sessionId: selectedSessionId,
        id: rule.id,
        data: { enabled: !rule.enabled },
      });
    } catch (error) {
      toast.error(t('autoReplies.toasts.updateFailed', {
        message: error instanceof Error ? error.message : t('common.unknownError'),
      }));
    }
  };

  const deleteRule = async () => {
    if (!deleteTarget || !selectedSessionId) return;
    try {
      await deleteMutation.mutateAsync({ sessionId: selectedSessionId, id: deleteTarget.id });
      toast.success(t('autoReplies.toasts.deleted'));
      setDeleteTarget(null);
    } catch (error) {
      toast.error(t('autoReplies.toasts.deleteFailed', {
        message: error instanceof Error ? error.message : t('common.unknownError'),
      }));
    }
  };

  if (loadingSessions) {
    return <div className="auto-replies-page auto-replies-loading"><Loader2 className="animate-spin" size={32} /></div>;
  }

  return (
    <div className="auto-replies-page">
      <PageHeader
        title={t('autoReplies.title')}
        subtitle={t('autoReplies.subtitle')}
        actions={
          <select
            className="auto-replies-session-select"
            aria-label={t('autoReplies.sessionSelect')}
            value={selectedSessionId}
            onChange={event => setSelectedSessionId(event.target.value)}
          >
            {sessions.length === 0 && (
              <option value="">{t(sessionsFailed ? 'dashboard.loadError' : 'autoReplies.noSessions')}</option>
            )}
            {sessions.map(session => <option key={session.id} value={session.id}>{session.name}</option>)}
          </select>
        }
      />

      {sessionsFailed ? (
        <div className="auto-replies-state" role="alert"><AlertCircle size={40} /><h3>{t('dashboard.loadError')}</h3><p>{sessionsError.message}</p></div>
      ) : sessions.length === 0 ? (
        <div className="auto-replies-state"><MessageCircle size={44} /><h3>{t('autoReplies.empty.noSessionsTitle')}</h3><p>{t('autoReplies.empty.noSessionsDesc')}</p></div>
      ) : !canWrite ? (
        <div className="auto-replies-state"><AlertCircle size={40} /><h3>{t('autoReplies.empty.forbiddenTitle')}</h3><p>{t('autoReplies.empty.forbiddenDesc')}</p></div>
      ) : (
        <>
          <section className="auto-replies-intro">
            <div className="auto-replies-intro-icon"><Zap size={22} /></div>
            <div><h2>{t('autoReplies.howTitle')}</h2><p>{t('autoReplies.howDescription')}</p></div>
            <button className="btn-primary" type="button" onClick={openCreate}><Plus size={17} />{t('autoReplies.addRule')}</button>
          </section>

          {loadingRules ? (
            <div className="auto-replies-state"><Loader2 className="animate-spin" size={28} /></div>
          ) : rulesError && rules.length === 0 ? (
            <div className="auto-replies-state" role="alert">
              <AlertCircle size={40} />
              <h3>{(rulesError as { status?: number }).status === 403 ? t('autoReplies.empty.forbiddenTitle') : t('autoReplies.empty.loadErrorTitle')}</h3>
              <p>{(rulesError as Error).message}</p>
            </div>
          ) : rules.length === 0 ? (
            <div className="auto-replies-state"><MessageCircle size={44} /><h3>{t('autoReplies.empty.title')}</h3><p>{t('autoReplies.empty.description')}</p><button className="btn-primary" type="button" onClick={openCreate}><Plus size={17} />{t('autoReplies.addRule')}</button></div>
          ) : (
            <div className="auto-replies-list">
              {rules.map(rule => {
                const condition = bodyCondition(rule);
                const keyword = typeof condition?.value === 'string' ? condition.value : t('autoReplies.anyMessage');
                return (
                  <article className={`auto-reply-card ${rule.enabled ? '' : 'disabled'}`} key={rule.id}>
                    <div className="auto-reply-card-main">
                      <div className="auto-reply-card-heading">
                        <span className={`auto-reply-status ${rule.enabled ? 'enabled' : ''}`}>
                          {rule.enabled ? t('autoReplies.enabled') : t('autoReplies.disabled')}
                        </span>
                        <h2>{rule.name}</h2>
                      </div>
                      <div className="auto-reply-trigger">
                        <span>{t('autoReplies.whenMessage')}</span>
                        <code>{condition?.operator === 'equals' ? '=' : 'contains'}</code>
                        <strong>{keyword}</strong>
                      </div>
                      <div className="auto-reply-response"><MessageCircle size={16} /><p>{rule.replyText}</p></div>
                      <small>{t('autoReplies.cooldownSummary', { seconds: rule.cooldownSeconds })}</small>
                    </div>
                    <div className="auto-reply-card-actions">
                      <button className="btn-secondary auto-reply-toggle" type="button" aria-pressed={rule.enabled} onClick={() => void toggleRule(rule)}>
                        {rule.enabled ? <><Check size={15} />{t('autoReplies.enabled')}</> : t('autoReplies.enable')}
                      </button>
                      <button className="icon-btn" type="button" aria-label={t('autoReplies.actions.edit')} onClick={() => openEdit(rule)}><Pencil size={17} /></button>
                      <button className="icon-btn danger" type="button" aria-label={t('autoReplies.actions.delete')} onClick={() => setDeleteTarget(rule)}><Trash2 size={17} /></button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={t(editingRule ? 'autoReplies.editTitle' : 'autoReplies.createTitle')}
        closeLabel={t('common.close')}
        footer={
          <>
            <button className="btn-secondary" type="button" onClick={closeModal} disabled={isSaving}>{t('common.cancel')}</button>
            <button className="btn-primary" type="submit" form="auto-reply-form" disabled={isSaving || !draft.name.trim() || !draft.keyword.trim() || !draft.replyText.trim()}>
              {isSaving ? <Loader2 className="animate-spin" size={16} /> : null}{t(editingRule ? 'common.save' : 'common.create')}
            </button>
          </>
        }
      >
        <form id="auto-reply-form" className="auto-reply-form" onSubmit={event => void saveRule(event)}>
          <label><span>{t('autoReplies.nameLabel')}</span><input autoFocus maxLength={100} required value={draft.name} placeholder={t('autoReplies.namePlaceholder')} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} /></label>
          <div className="auto-reply-trigger-fields">
            <label className="auto-reply-keyword"><span>{t('autoReplies.keywordLabel')}</span><input required value={draft.keyword} placeholder={t('autoReplies.keywordPlaceholder')} onChange={event => setDraft(current => ({ ...current, keyword: event.target.value }))} /></label>
            <label className="auto-reply-match"><span>{t('autoReplies.matchLabel')}</span><select value={draft.operator} onChange={event => setDraft(current => ({ ...current, operator: event.target.value as Draft['operator'] }))}><option value="contains">{t('autoReplies.contains')}</option><option value="equals">{t('autoReplies.equals')}</option></select></label>
          </div>
          <p className="auto-reply-hint">{t('autoReplies.keywordHint')}</p>
          <label><span>{t('autoReplies.replyLabel')}</span><textarea required maxLength={4096} rows={5} value={draft.replyText} placeholder={t('autoReplies.replyPlaceholder')} onChange={event => setDraft(current => ({ ...current, replyText: event.target.value }))} /></label>
          <label><span>{t('autoReplies.cooldownLabel')}</span><select value={draft.cooldownSeconds} onChange={event => setDraft(current => ({ ...current, cooldownSeconds: Number(event.target.value) }))}><option value={0}>{t('autoReplies.noCooldown')}</option><option value={60}>{t('autoReplies.oneMinute')}</option><option value={300}>{t('autoReplies.fiveMinutes')}</option><option value={3600}>{t('autoReplies.oneHour')}</option><option value={86400}>{t('autoReplies.oneDay')}</option></select></label>
        </form>
      </Modal>

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={t('autoReplies.deleteTitle')}
        closeLabel={t('common.close')}
        footer={<><button className="btn-secondary" type="button" onClick={() => setDeleteTarget(null)}>{t('common.cancel')}</button><button className="btn-danger" type="button" onClick={() => void deleteRule()} disabled={deleteMutation.isPending}>{deleteMutation.isPending ? <Loader2 className="animate-spin" size={16} /> : null}{t('common.delete')}</button></>}
      >
        <p>{t('autoReplies.deleteConfirm', { name: deleteTarget?.name ?? '' })}</p>
      </Modal>
    </div>
  );
}
