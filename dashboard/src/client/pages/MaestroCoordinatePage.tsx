import { useEffect, useCallback, useMemo } from 'react';
import { useMaestroCoordinateStore } from '@/client/store/maestro-coordinate-store.js';
import type { SessionDetail } from '@/client/store/maestro-coordinate-store.js';
import { useI18n } from '@/client/i18n/index.js';
import type {
  MaestroSessionListItem,
  RalphStatusJson,
  MaestroStatusJson,
  CoordinateWalkerState,
  RalphStep,
  MaestroStep,
  CoordHistoryEntry,
} from '@/shared/maestro-session-types.js';

// ---------------------------------------------------------------------------
// Source color mapping
// ---------------------------------------------------------------------------

const SOURCE_COLORS: Record<string, string> = {
  ralph: 'var(--color-accent-purple)',
  maestro: 'var(--color-accent-blue)',
  coordinate: 'var(--color-accent-green)',
};

// ---------------------------------------------------------------------------
// Status badge color mapping
// ---------------------------------------------------------------------------

const STATUS_BADGE_COLORS: Record<string, { bg: string; color: string }> = {
  running:   { bg: 'var(--color-tint-running)',   color: 'var(--color-accent-blue)' },
  completed: { bg: 'var(--color-tint-completed)', color: 'var(--color-accent-green)' },
  failed:    { bg: 'var(--color-tint-failed)',    color: 'var(--color-accent-red)' },
  pending:   { bg: 'var(--color-tint-pending)',   color: 'var(--color-accent-gray)' },
  idle:      { bg: 'var(--color-tint-pending)',   color: 'var(--color-accent-gray)' },
  paused:    { bg: 'var(--color-tint-pending)',   color: 'var(--color-accent-gray)' },
  verifying: { bg: 'var(--color-tint-verifying)', color: 'var(--color-accent-orange)' },
};

// ---------------------------------------------------------------------------
// Step dot color mapping
// ---------------------------------------------------------------------------

const STEP_DOT_COLORS: Record<string, string> = {
  completed: 'var(--color-accent-green)',
  running:   'var(--color-accent-blue)',
  pending:   'var(--color-accent-gray)',
  failed:    'var(--color-accent-red)',
  skipped:   'var(--color-accent-gray)',
};

const STEP_BG_COLORS: Record<string, string> = {
  completed: 'var(--color-tint-completed)',
  running:   'var(--color-tint-running)',
  pending:   'transparent',
  failed:    'var(--color-tint-failed)',
  skipped:   'transparent',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusBadgeStyle(status: string): React.CSSProperties {
  const c = STATUS_BADGE_COLORS[status] ?? STATUS_BADGE_COLORS.pending;
  return {
    fontSize: 9,
    fontWeight: 700,
    padding: '2px 8px',
    borderRadius: 100,
    background: c.bg,
    color: c.color,
    whiteSpace: 'nowrap',
  };
}

function formatRelativeTime(dateStr: string): string {
  try {
    const diff = Date.now() - new Date(dateStr).getTime();
    const secs = Math.floor(diff / 1000);
    if (secs < 60) return `${secs}s ago`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  } catch {
    return '';
  }
}

function formatTimestamp(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleString();
  } catch {
    return dateStr;
  }
}

function formatDuration(startedAt?: string, completedAt?: string): string {
  if (!startedAt) return '';
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const secs = Math.floor((end - start) / 1000);
  if (secs < 0) return '';
  const mins = Math.floor(secs / 60);
  if (mins > 0) return `${mins}m ${secs % 60}s`;
  return `${secs}s`;
}

// ---------------------------------------------------------------------------
// MaestroCoordinatePage
// ---------------------------------------------------------------------------

export function MaestroCoordinatePage() {
  const { t } = useI18n();

  const sessions = useMaestroCoordinateStore((s) => s.sessions);
  const selectedDir = useMaestroCoordinateStore((s) => s.selectedDir);
  const sessionDetail = useMaestroCoordinateStore((s) => s.sessionDetail);
  const isLoading = useMaestroCoordinateStore((s) => s.isLoading);
  const error = useMaestroCoordinateStore((s) => s.error);
  const fetchSessions = useMaestroCoordinateStore((s) => s.fetchSessions);
  const selectSession = useMaestroCoordinateStore((s) => s.selectSession);
  const clearError = useMaestroCoordinateStore((s) => s.clearError);

  // Fetch sessions on mount
  useEffect(() => {
    void fetchSessions();
  }, [fetchSessions]);

  // Selected session list item
  const selectedSession = useMemo(
    () => (selectedDir ? sessions.find((s) => s.dirName === selectedDir) ?? null : null),
    [sessions, selectedDir],
  );

  const handleRefresh = useCallback(() => {
    void fetchSessions();
  }, [fetchSessions]);

  const handleSelectSession = useCallback(
    (dirName: string) => {
      selectSession(dirName === selectedDir ? null : dirName);
    },
    [selectSession, selectedDir],
  );

  return (
    <div style={pageStyle}>
      {/* ---- Header ---- */}
      <header style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={headerTitleStyle}>{t('maestro_coordinate.title')}</span>
          {isLoading && (
            <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>Loading...</span>
          )}
        </div>
        <button type="button" onClick={handleRefresh} style={refreshBtnStyle}>
          <svg
            width="14" height="14" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round"
          >
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
        </button>
      </header>

      {/* ---- Error banner ---- */}
      {error && (
        <div style={errorBannerStyle}>
          <span style={{ flex: 1 }}>{error}</span>
          <button type="button" onClick={clearError} style={errorDismissBtnStyle}>
            x
          </button>
        </div>
      )}

      {/* ---- Master-detail body ---- */}
      <div style={bodyStyle}>
        {/* ---- Left panel: Session List ---- */}
        <aside style={leftPanelStyle}>
          <div style={leftPanelHeaderStyle}>
            <span style={leftPanelTitleStyle}>{t('maestro_coordinate.sessions')}</span>
            <span style={leftPanelCountStyle}>{sessions.length}</span>
          </div>
          <div style={leftPanelListStyle}>
            {sessions.length === 0 && !isLoading && (
              <div style={emptyListStyle}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
                  {t('maestro_coordinate.no_sessions')}
                </div>
                <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', lineHeight: 1.5 }}>
                  {t('maestro_coordinate.no_sessions_desc')}
                </div>
              </div>
            )}
            {sessions.map((session) => (
              <SessionListItem
                key={session.dirName}
                session={session}
                isSelected={session.dirName === selectedDir}
                onClick={handleSelectSession}
              />
            ))}
          </div>
        </aside>

        {/* ---- Right panel: Session Detail ---- */}
        <main style={rightPanelStyle}>
          {selectedSession && sessionDetail ? (
            <SessionDetailPanel session={selectedSession} detail={sessionDetail} />
          ) : (
            <div style={emptyDetailStyle}>
              <svg
                width="48" height="48" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="1"
                strokeLinecap="round" strokeLinejoin="round"
                style={{ opacity: 0.15, marginBottom: 12 }}
              >
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="9" y1="3" x2="9" y2="21" />
              </svg>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
                {t('maestro_coordinate.select_session')}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ---- Status bar ---- */}
      <footer style={statusBarStyle}>
        <span style={{ color: 'var(--color-text-secondary)' }}>
          {sessions.length} {t('maestro_coordinate.sessions').toLowerCase()}
        </span>
        <span style={{ color: 'var(--color-text-tertiary)' }}>
          Last refresh: {new Date().toLocaleTimeString()}
        </span>
      </footer>

      {/* Pulse animation for running steps */}
      <style>{PULSE_ANIMATION}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SessionListItem
// ---------------------------------------------------------------------------

function SessionListItem({
  session,
  isSelected,
  onClick,
}: {
  session: MaestroSessionListItem;
  isSelected: boolean;
  onClick: (dirName: string) => void;
}) {
  const sourceColor = SOURCE_COLORS[session.source] ?? 'var(--color-accent-gray)';
  const badge = STATUS_BADGE_COLORS[session.status] ?? STATUS_BADGE_COLORS.pending;

  return (
    <button
      type="button"
      onClick={() => onClick(session.dirName)}
      style={{
        ...listItemBtnBase,
        background: isSelected ? 'var(--color-bg-hover, rgba(0,0,0,0.04))' : 'transparent',
      }}
    >
      {/* Source dot */}
      <div style={{
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: sourceColor,
        flexShrink: 0,
      }} />

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--color-text-primary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          textAlign: 'left',
        }}>
          {session.intent || session.dirName}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
          <span style={statusBadgeStyle(session.status)}>
            {session.status}
          </span>
          <span style={{
            fontSize: 9,
            color: 'var(--color-text-tertiary)',
            whiteSpace: 'nowrap',
          }}>
            {session.currentStep}/{session.totalSteps}
          </span>
        </div>
        <div style={{
          fontSize: 9,
          color: 'var(--color-text-tertiary)',
          marginTop: 3,
          textAlign: 'left',
        }}>
          {formatRelativeTime(session.updatedAt)}
        </div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// SessionDetailPanel
// ---------------------------------------------------------------------------

function SessionDetailPanel({
  session,
  detail,
}: {
  session: MaestroSessionListItem;
  detail: SessionDetail;
}) {
  const { t } = useI18n();

  return (
    <div style={{ padding: '20px 24px', overflowY: 'auto', height: '100%' }}>
      {/* ---- Header card ---- */}
      <div style={cardStyle}>
        <div style={cardHeaderStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: SOURCE_COLORS[session.source] ?? 'var(--color-accent-gray)',
            }} />
            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {session.source}
            </span>
          </div>
          <span style={statusBadgeStyle(session.status)}>{session.status}</span>
        </div>
        <div style={{ padding: '14px 16px' }}>
          {/* Intent */}
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)', lineHeight: 1.4, marginBottom: 12 }}>
            {session.intent}
          </div>

          {/* Meta row */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
            {session.chainName && (
              <MetaField label="Chain" value={session.chainName} />
            )}
            {session.lifecyclePosition && (
              <MetaField label="Lifecycle" value={session.lifecyclePosition} />
            )}
            {session.phase != null && (
              <MetaField label="Phase" value={String(session.phase)} />
            )}
            {session.milestone && (
              <MetaField label="Milestone" value={session.milestone} />
            )}
            <MetaField label="Progress" value={`${session.currentStep}/${session.totalSteps}`} />
            <MetaField label="Updated" value={formatTimestamp(session.updatedAt)} />
          </div>
        </div>
      </div>

      {/* ---- Steps / History Timeline card ---- */}
      <div style={{ ...cardStyle, marginTop: 16 }}>
        <div style={cardHeaderStyle}>
          <span style={cardTitleStyle}>{t('maestro_coordinate.steps')}</span>
          {session.source === 'coordinate' && detail.source === 'coordinate' && (
            <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
              Node: {detail.data.current_node}
            </span>
          )}
        </div>
        <div style={{ padding: '14px 16px' }}>
          {detail.source === 'ralph' && <RalphStepsTimeline steps={detail.data.steps} />}
          {detail.source === 'maestro' && <MaestroStepsTimeline steps={detail.data.steps} />}
          {detail.source === 'coordinate' && <CoordHistoryTimeline history={detail.data.history} />}
        </div>
      </div>

      {/* ---- Context card (ralph only) ---- */}
      {detail.source === 'ralph' && (
        <div style={{ ...cardStyle, marginTop: 16 }}>
          <div style={cardHeaderStyle}>
            <span style={cardTitleStyle}>{t('maestro_coordinate.context')}</span>
          </div>
          <div style={{ padding: '14px 16px' }}>
            <RalphContextCard data={detail.data} />
          </div>
        </div>
      )}

      {/* ---- Coordinate context card ---- */}
      {detail.source === 'coordinate' && detail.data.context && (
        <div style={{ ...cardStyle, marginTop: 16 }}>
          <div style={cardHeaderStyle}>
            <span style={cardTitleStyle}>{t('maestro_coordinate.context')}</span>
          </div>
          <div style={{ padding: '14px 16px' }}>
            <CoordContextCard data={detail.data} />
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Meta field helper
// ---------------------------------------------------------------------------

function MetaField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)' }}>
        {value}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ralph Steps Timeline
// ---------------------------------------------------------------------------

function RalphStepsTimeline({ steps }: { steps: RalphStep[] }) {
  if (steps.length === 0) {
    return <div style={emptyStepsStyle}>No steps recorded</div>;
  }

  return (
    <div>
      {steps.map((step, idx) => {
        const status = step.status ?? 'pending';
        const dotColor = STEP_DOT_COLORS[status] ?? STEP_DOT_COLORS.pending;
        const bgColor = STEP_BG_COLORS[status] ?? 'transparent';
        const isLast = idx === steps.length - 1;

        return (
          <div key={step.index} style={timelineRowStyle}>
            {/* Connecting line */}
            {!isLast && (
              <div style={{
                ...timelineLineStyle,
                background: status === 'completed' ? 'var(--color-accent-green)' : 'var(--color-border-divider)',
                opacity: status === 'completed' ? 0.4 : 1,
              }} />
            )}
            {/* Dot */}
            <div style={{
              ...timelineDotContainerStyle,
              background: bgColor,
            }}>
              <div style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: dotColor,
                animation: status === 'running' ? 'mcPulse 2s infinite' : undefined,
              }} />
            </div>
            {/* Content */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  {step.skill}
                </span>
                <span style={statusBadgeStyle(status)}>{status}</span>
              </div>
              {step.args && (
                <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {step.args}
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                <span style={{ fontSize: 9, fontFamily: "'SF Mono', Consolas, monospace", color: 'var(--color-text-tertiary)' }}>
                  {step.type}
                </span>
                {(step.started_at || step.completed_at) && (
                  <span style={{ fontSize: 9, fontFamily: "'SF Mono', Consolas, monospace", color: 'var(--color-text-tertiary)' }}>
                    {formatDuration(step.started_at, step.completed_at)}
                  </span>
                )}
                {step.retried && (
                  <span style={{ fontSize: 9, color: 'var(--color-accent-orange)' }}>retried</span>
                )}
              </div>
              {step.error && (
                <div style={{ fontSize: 10, color: 'var(--color-accent-red)', marginTop: 4, lineHeight: 1.4 }}>
                  {step.error}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Maestro Steps Timeline
// ---------------------------------------------------------------------------

function MaestroStepsTimeline({ steps }: { steps: MaestroStep[] }) {
  if (steps.length === 0) {
    return <div style={emptyStepsStyle}>No steps recorded</div>;
  }

  return (
    <div>
      {steps.map((step, idx) => {
        const status = step.status ?? 'pending';
        const dotColor = STEP_DOT_COLORS[status] ?? STEP_DOT_COLORS.pending;
        const bgColor = STEP_BG_COLORS[status] ?? 'transparent';
        const isLast = idx === steps.length - 1;

        return (
          <div key={step.index} style={timelineRowStyle}>
            {!isLast && (
              <div style={{
                ...timelineLineStyle,
                background: status === 'completed' ? 'var(--color-accent-green)' : 'var(--color-border-divider)',
                opacity: status === 'completed' ? 0.4 : 1,
              }} />
            )}
            <div style={{ ...timelineDotContainerStyle, background: bgColor }}>
              <div style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: dotColor,
                animation: status === 'running' ? 'mcPulse 2s infinite' : undefined,
              }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  {step.skill}
                </span>
                <span style={statusBadgeStyle(status)}>{status}</span>
              </div>
              {step.args && (
                <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {step.args}
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                <span style={{ fontSize: 9, fontFamily: "'SF Mono', Consolas, monospace", color: 'var(--color-text-tertiary)' }}>
                  {step.type}
                </span>
                {(step.started_at || step.completed_at) && (
                  <span style={{ fontSize: 9, fontFamily: "'SF Mono', Consolas, monospace", color: 'var(--color-text-tertiary)' }}>
                    {formatDuration(step.started_at, step.completed_at)}
                  </span>
                )}
              </div>
              {step.error && (
                <div style={{ fontSize: 10, color: 'var(--color-accent-red)', marginTop: 4, lineHeight: 1.4 }}>
                  {step.error}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Coordinate History Timeline
// ---------------------------------------------------------------------------

function CoordHistoryTimeline({ history }: { history: CoordHistoryEntry[] }) {
  if (history.length === 0) {
    return <div style={emptyStepsStyle}>No history entries</div>;
  }

  return (
    <div>
      {history.map((entry, idx) => {
        const isLast = idx === history.length - 1;
        const dotColor = entry.outcome === 'success'
          ? 'var(--color-accent-green)'
          : entry.outcome === 'failed'
            ? 'var(--color-accent-red)'
            : 'var(--color-accent-blue)';

        return (
          <div key={`${entry.node_id}-${idx}`} style={timelineRowStyle}>
            {!isLast && (
              <div style={{ ...timelineLineStyle, background: 'var(--color-border-divider)' }} />
            )}
            <div style={{ ...timelineDotContainerStyle, background: 'transparent' }}>
              <div style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: dotColor,
              }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  {entry.node_id}
                </span>
                <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>
                  {entry.node_type}
                </span>
                {entry.outcome && (
                  <span style={statusBadgeStyle(entry.outcome === 'success' ? 'completed' : entry.outcome)}>
                    {entry.outcome}
                  </span>
                )}
                {entry.quality_score != null && (
                  <span style={{
                    fontSize: 9,
                    fontWeight: 600,
                    padding: '1px 7px',
                    borderRadius: 100,
                    background: entry.quality_score >= 70
                      ? 'var(--color-tint-completed)'
                      : entry.quality_score >= 40
                        ? 'var(--color-tint-verifying)'
                        : 'var(--color-tint-failed)',
                    color: entry.quality_score >= 70
                      ? 'var(--color-accent-green)'
                      : entry.quality_score >= 40
                        ? 'var(--color-accent-orange)'
                        : 'var(--color-accent-red)',
                  }}>
                    {entry.quality_score}
                  </span>
                )}
              </div>
              {entry.summary && (
                <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', marginTop: 3, lineHeight: 1.4 }}>
                  {entry.summary}
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                {entry.entered_at && (
                  <span style={{ fontSize: 9, fontFamily: "'SF Mono', Consolas, monospace", color: 'var(--color-text-tertiary)' }}>
                    {formatDuration(entry.entered_at, entry.exited_at)}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ralph Context Card
// ---------------------------------------------------------------------------

function RalphContextCard({ data }: { data: RalphStatusJson }) {
  const { t } = useI18n();

  return (
    <div>
      {/* Passed Gates */}
      {data.passed_gates.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
            {t('maestro_coordinate.passed_gates')}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {data.passed_gates.map((gate, idx) => (
              <span key={idx} style={{
                fontSize: 9,
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: 100,
                background: 'var(--color-tint-completed)',
                color: 'var(--color-accent-green)',
              }}>
                {gate}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Quality mode + auto mode */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
        <MetaField label="Quality Mode" value={data.quality_mode || '--'} />
        <MetaField label="Auto Mode" value={data.auto_mode ? 'Yes' : 'No'} />
        <MetaField label="CLI Tool" value={data.cli_tool || '--'} />
        <MetaField label="Task Type" value={data.task_type || '--'} />
      </div>

      {/* Target + context fields */}
      {data.target && (
        <MetaField label="Target" value={data.target} />
      )}
      {data.context.issue_id && (
        <div style={{ marginTop: 8 }}>
          <MetaField label="Issue" value={data.context.issue_id} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Coordinate Context Card
// ---------------------------------------------------------------------------

function CoordContextCard({ data }: { data: CoordinateWalkerState }) {
  const ctx = data.context;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
      <MetaField label="Graph ID" value={data.graph_id} />
      <MetaField label="Current Node" value={data.current_node} />
      {data.tool && <MetaField label="Tool" value={data.tool} />}
      {data.auto_mode != null && <MetaField label="Auto Mode" value={data.auto_mode ? 'Yes' : 'No'} />}
      {ctx?.project?.current_phase != null && (
        <MetaField label="Phase" value={String(ctx.project.current_phase)} />
      )}
      {ctx?.inputs && Object.keys(ctx.inputs).length > 0 && (
        <div style={{ width: '100%' }}>
          <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
            Inputs
          </div>
          <pre style={{
            margin: 0,
            padding: '8px 12px',
            fontSize: 10,
            lineHeight: 1.5,
            background: 'var(--color-bg-secondary)',
            borderRadius: 6,
            color: 'var(--color-text-secondary)',
            overflow: 'auto',
            maxHeight: 120,
          }}>
            {JSON.stringify(ctx.inputs, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared inline styles
// ---------------------------------------------------------------------------

const pageStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  overflow: 'hidden',
  background: 'var(--color-bg-primary)',
};

const headerStyle: React.CSSProperties = {
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0 16px',
  height: 44,
  background: 'var(--color-bg-secondary)',
  borderBottom: '1px solid var(--color-border)',
};

const headerTitleStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: 'var(--color-text-primary)',
};

const refreshBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 28,
  height: 28,
  padding: 0,
  border: '1px solid var(--color-border)',
  borderRadius: 6,
  background: 'none',
  color: 'var(--color-text-secondary)',
  cursor: 'pointer',
  transition: 'background 120ms',
};

const errorBannerStyle: React.CSSProperties = {
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  padding: '8px 16px',
  fontSize: 11,
  color: 'var(--color-accent-red)',
  background: 'var(--color-tint-failed)',
  borderBottom: '1px solid var(--color-border-divider)',
};

const errorDismissBtnStyle: React.CSSProperties = {
  padding: '2px 6px',
  border: 'none',
  borderRadius: 4,
  background: 'transparent',
  color: 'var(--color-accent-red)',
  cursor: 'pointer',
  fontSize: 11,
  fontWeight: 600,
};

const bodyStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  minHeight: 0,
  overflow: 'hidden',
};

const leftPanelStyle: React.CSSProperties = {
  width: 280,
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column',
  borderRight: '1px solid var(--color-border)',
  background: 'var(--color-bg-secondary)',
};

const leftPanelHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '10px 14px',
  borderBottom: '1px solid var(--color-border-divider)',
};

const leftPanelTitleStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--color-text-tertiary)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const leftPanelCountStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  padding: '1px 6px',
  borderRadius: 100,
  background: 'var(--color-bg-card)',
  color: 'var(--color-text-tertiary)',
};

const leftPanelListStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '4px 0',
};

const listItemBtnBase: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 10,
  width: '100%',
  padding: '10px 14px',
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  textAlign: 'left',
  transition: 'background 120ms',
  borderBottom: '1px solid var(--color-border-divider)',
};

const emptyListStyle: React.CSSProperties = {
  padding: '24px 14px',
  textAlign: 'center',
};

const rightPanelStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  overflowY: 'auto',
  background: 'var(--color-bg-primary)',
};

const emptyDetailStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  color: 'var(--color-text-tertiary)',
  padding: '48px 20px',
  textAlign: 'center',
};

const statusBarStyle: React.CSSProperties = {
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  height: 28,
  padding: '0 16px',
  background: 'var(--color-bg-secondary)',
  borderTop: '1px solid var(--color-border)',
  fontSize: 10,
};

const cardStyle: React.CSSProperties = {
  background: 'var(--color-bg-card)',
  borderRadius: 10,
  border: '1px solid var(--color-border-divider)',
  overflow: 'hidden',
};

const cardHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '10px 16px',
  borderBottom: '1px solid var(--color-border-divider)',
};

const cardTitleStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--color-text-primary)',
};

const emptyStepsStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--color-text-tertiary)',
  textAlign: 'center',
  padding: '24px 0',
};

// Timeline row styles
const timelineRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 12,
  padding: '8px 0',
  position: 'relative',
};

const timelineLineStyle: React.CSSProperties = {
  position: 'absolute',
  left: 11,
  top: 30,
  bottom: -8,
  width: 1,
};

const timelineDotContainerStyle: React.CSSProperties = {
  width: 22,
  height: 22,
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  border: '2px solid var(--color-bg-primary)',
};

// Pulse animation (scoped via unique key)
const PULSE_ANIMATION = `@keyframes mcPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}`;
