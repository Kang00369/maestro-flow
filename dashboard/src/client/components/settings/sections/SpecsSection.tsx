import { useEffect, useState, useCallback } from 'react';
import { SettingsCard, SettingsSaveBar } from '../SettingsComponents.js';
import { cn } from '@/client/lib/utils.js';
import { useI18n } from '@/client/i18n/index.js';

// ---------------------------------------------------------------------------
// SpecsSection — read-only spec directory browser
// ---------------------------------------------------------------------------

interface SpecEntry {
  name: string;
  path: string;
  createdAt?: string;
}

export function SpecsSection() {
  const { t } = useI18n();
  const [specs, setSpecs] = useState<SpecEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchSpecs() {
      try {
        const res = await fetch('/api/settings/specs');
        if (!res.ok) throw new Error(`Failed to load specs: ${res.status}`);
        const data = (await res.json()) as { specs: SpecEntry[] };
        if (!cancelled) {
          setSpecs(data.specs ?? []);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load specs');
          setLoading(false);
        }
      }
    }

    void fetchSpecs();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-[var(--spacing-8)]">
        <span className="text-[length:var(--font-size-sm)] text-text-secondary">
          {t('settings.specs.loading')}
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <SettingsCard title={t('settings.specs.error_card')} description={t('settings.specs.error_desc')}>
        <p className="text-[length:var(--font-size-sm)] text-status-blocked">{error}</p>
      </SettingsCard>
    );
  }

  if (specs.length === 0) {
    return (
      <div className="flex flex-col gap-[var(--spacing-6)]">
        <SettingsCard
          title={t('settings.specs.empty_card')}
          description={t('settings.specs.empty_desc')}
        >
          <p className="text-[length:var(--font-size-sm)] text-text-secondary italic">
            {t('settings.specs.empty_hint')}
          </p>
        </SettingsCard>
        <SpecInjectionConfig />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[var(--spacing-6)]">
      <div className="flex flex-col gap-[var(--spacing-3)]">
        {specs.map((spec) => (
          <SettingsCard key={spec.name} title={spec.name} description={spec.path}>
            {spec.createdAt && (
              <span className="text-[length:var(--font-size-xs)] text-text-tertiary">
                {t('settings.specs.created')}: {spec.createdAt}
              </span>
            )}
          </SettingsCard>
        ))}
      </div>
      <SpecInjectionConfig />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Types for spec injection config
// ---------------------------------------------------------------------------

interface AgentMapping {
  categories?: string[];
  includeKeywords?: string[];
  excludeKeywords?: string[];
  extras?: string[];
}

interface CategoryDoc {
  specFiles?: string[];
  docs?: string[];
}

interface SpecInjectionConfigData {
  mapping?: Record<string, AgentMapping>;
  categoryDocs?: Record<string, CategoryDoc>;
  always?: string[];
  keywordFilters?: { include?: string[]; exclude?: string[] };
  maxContentLength?: number;
}

interface SpecInjectionDefaults {
  agentCategoryMap: Record<string, string[]>;
  categoryFileMap: Record<string, string>;
  validCategories: string[];
}

// ---------------------------------------------------------------------------
// TagChip — small removable tag
// ---------------------------------------------------------------------------

function TagChip({
  label,
  onRemove,
  variant = 'default',
}: {
  label: string;
  onRemove: () => void;
  variant?: 'default' | 'include' | 'exclude';
}) {
  const colorClass =
    variant === 'include'
      ? 'bg-status-active/15 text-status-active border-status-active/30'
      : variant === 'exclude'
        ? 'bg-status-blocked/15 text-status-blocked border-status-blocked/30'
        : 'bg-bg-hover text-text-secondary border-border';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-[var(--spacing-1)] px-[var(--spacing-2)] py-[var(--spacing-0-5)]',
        'rounded-[var(--radius-sm)] border text-[length:var(--font-size-xs)]',
        colorClass,
      )}
    >
      {label}
      <button
        type="button"
        onClick={onRemove}
        className="ml-[var(--spacing-0-5)] text-current opacity-60 hover:opacity-100 focus-visible:outline-none"
        aria-label={`Remove ${label}`}
      >
        x
      </button>
    </span>
  );
}

// ---------------------------------------------------------------------------
// TagInput — inline input that adds tags on Enter
// ---------------------------------------------------------------------------

function TagInput({
  placeholder,
  onAdd,
}: {
  placeholder: string;
  onAdd: (value: string) => void;
}) {
  const [value, setValue] = useState('');

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && value.trim()) {
      e.preventDefault();
      onAdd(value.trim());
      setValue('');
    }
  };

  return (
    <input
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      className={cn(
        'px-[var(--spacing-2)] py-[var(--spacing-1)] rounded-[var(--radius-sm)]',
        'border border-border bg-bg-primary text-text-primary text-[length:var(--font-size-xs)]',
        'focus:outline-none focus:border-accent-blue focus:shadow-[var(--shadow-focus-ring)]',
        'transition-colors duration-[var(--duration-fast)]',
        'placeholder:text-text-tertiary w-40',
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// CollapsibleSection — togglable section header
// ---------------------------------------------------------------------------

function CollapsibleSection({
  title,
  description,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  description?: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-border rounded-[var(--radius-default)] overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          'w-full flex items-center justify-between px-[var(--spacing-4)] py-[var(--spacing-3)]',
          'bg-bg-secondary hover:bg-bg-hover transition-colors duration-[var(--duration-fast)]',
          'focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]',
        )}
      >
        <div className="text-left">
          <span className="text-[length:var(--font-size-sm)] font-[var(--font-weight-semibold)] text-text-primary">
            {title}
          </span>
          {description && (
            <p className="mt-[var(--spacing-0-5)] text-[length:var(--font-size-xs)] text-text-secondary">
              {description}
            </p>
          )}
        </div>
        <span className="text-[length:var(--font-size-xs)] text-text-tertiary shrink-0 ml-[var(--spacing-2)]">
          {expanded ? '[-]' : '[+]'}
        </span>
      </button>
      {expanded && (
        <div className="px-[var(--spacing-4)] py-[var(--spacing-3)] border-t border-border bg-bg-primary">
          {children}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PathList — editable list of file paths with add/remove
// ---------------------------------------------------------------------------

function PathList({
  paths,
  onChange,
  placeholder,
}: {
  paths: string[];
  onChange: (paths: string[]) => void;
  placeholder: string;
}) {
  return (
    <div className="flex flex-col gap-[var(--spacing-1-5)]">
      {paths.map((p, i) => (
        <div key={`${p}-${i}`} className="flex items-center gap-[var(--spacing-2)]">
          <span className="text-[length:var(--font-size-xs)] text-text-secondary font-mono truncate flex-1 min-w-0">
            {p}
          </span>
          <button
            type="button"
            onClick={() => onChange(paths.filter((_, idx) => idx !== i))}
            className="text-[length:var(--font-size-xs)] text-status-blocked opacity-60 hover:opacity-100 shrink-0 focus-visible:outline-none"
            aria-label={`Remove ${p}`}
          >
            x
          </button>
        </div>
      ))}
      <TagInput
        placeholder={placeholder}
        onAdd={(v) => {
          if (!paths.includes(v)) onChange([...paths, v]);
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// SpecInjectionConfig — main config panel
// ---------------------------------------------------------------------------

function SpecInjectionConfig() {
  const { t } = useI18n();
  const [config, setConfig] = useState<SpecInjectionConfigData>({});
  const [defaults, setDefaults] = useState<SpecInjectionDefaults | null>(null);
  const [original, setOriginal] = useState<string>('{}');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [expandedAgents, setExpandedAgents] = useState<Record<string, boolean>>({});
  const [addingAgent, setAddingAgent] = useState(false);
  const [addingCategory, setAddingCategory] = useState(false);

  const isDirty = JSON.stringify(config) !== original;

  useEffect(() => {
    let cancelled = false;

    async function fetchConfig() {
      try {
        const res = await fetch('/api/settings/spec-injection');
        if (!res.ok) throw new Error(`Failed to load spec injection config: ${res.status}`);
        const data = (await res.json()) as {
          config: SpecInjectionConfigData;
          defaults: SpecInjectionDefaults;
        };
        if (!cancelled) {
          setConfig(data.config ?? {});
          setOriginal(JSON.stringify(data.config ?? {}));
          setDefaults(data.defaults);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load config');
          setLoading(false);
        }
      }
    }

    void fetchConfig();
    return () => { cancelled = true; };
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings/spec-injection', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error(`Save failed: ${res.status}`);
      setOriginal(JSON.stringify(config));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [config]);

  const handleDiscard = useCallback(() => {
    setConfig(JSON.parse(original));
    setError(null);
  }, [original]);

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleAgent = (agent: string) => {
    setExpandedAgents((prev) => ({ ...prev, [agent]: !prev[agent] }));
  };

  // --- Mutation helpers ---

  const updateMapping = (agent: string, patch: Partial<AgentMapping>) => {
    setConfig((prev) => ({
      ...prev,
      mapping: {
        ...prev.mapping,
        [agent]: { ...prev.mapping?.[agent], ...patch },
      },
    }));
  };

  const removeAgent = (agent: string) => {
    setConfig((prev) => {
      const next = { ...prev.mapping };
      delete next[agent];
      return { ...prev, mapping: Object.keys(next).length > 0 ? next : undefined };
    });
  };

  const updateCategoryDocs = (cat: string, patch: Partial<CategoryDoc>) => {
    setConfig((prev) => ({
      ...prev,
      categoryDocs: {
        ...prev.categoryDocs,
        [cat]: { ...prev.categoryDocs?.[cat], ...patch },
      },
    }));
  };

  const removeCategory = (cat: string) => {
    setConfig((prev) => {
      const next = { ...prev.categoryDocs };
      delete next[cat];
      return { ...prev, categoryDocs: Object.keys(next).length > 0 ? next : undefined };
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-[var(--spacing-4)]">
        <span className="text-[length:var(--font-size-sm)] text-text-secondary">
          Loading injection config...
        </span>
      </div>
    );
  }

  if (!defaults) return null;

  const mappedAgents = Object.keys(config.mapping ?? {});
  const unmappedAgents = Object.keys(defaults.agentCategoryMap).filter(
    (a) => !mappedAgents.includes(a),
  );
  const configuredCategories = Object.keys(config.categoryDocs ?? {});
  const unconfiguredCategories = defaults.validCategories.filter(
    (c) => !configuredCategories.includes(c),
  );

  return (
    <div className="flex flex-col gap-[var(--spacing-3)]">
      <div className="mb-[var(--spacing-1)]">
        <h3 className="text-[length:var(--font-size-sm)] font-[var(--font-weight-semibold)] text-text-primary">
          Spec Injection Config
        </h3>
        <p className="mt-[var(--spacing-0-5)] text-[length:var(--font-size-xs)] text-text-secondary">
          Configure which specs and docs are injected into agent contexts
        </p>
      </div>

      {error && (
        <p className="text-[length:var(--font-size-xs)] text-status-blocked px-[var(--spacing-1)]">
          {error}
        </p>
      )}

      {/* --- Agent Mappings --- */}
      <CollapsibleSection
        title="Agent Mappings"
        description="Per-agent category overrides, keyword filters, and extra docs"
        expanded={!!expandedSections['agents']}
        onToggle={() => toggleSection('agents')}
      >
        {mappedAgents.length === 0 && (
          <p className="text-[length:var(--font-size-xs)] text-text-tertiary italic mb-[var(--spacing-2)]">
            No custom agent mappings. Defaults are used for all agents.
          </p>
        )}

        <div className="flex flex-col gap-[var(--spacing-2)]">
          {mappedAgents.map((agent) => {
            const mapping = config.mapping![agent]!;
            const defaultCats = defaults.agentCategoryMap[agent] ?? [];
            const isExpanded = !!expandedAgents[agent];

            return (
              <div key={agent} className="border border-border-divider rounded-[var(--radius-sm)]">
                <div className="flex items-center justify-between px-[var(--spacing-3)] py-[var(--spacing-2)]">
                  <button
                    type="button"
                    onClick={() => toggleAgent(agent)}
                    className="flex-1 text-left text-[length:var(--font-size-sm)] font-[var(--font-weight-medium)] text-text-primary hover:text-accent-blue focus-visible:outline-none"
                  >
                    {agent}
                  </button>
                  <div className="flex items-center gap-[var(--spacing-2)]">
                    <span className="text-[length:var(--font-size-xs)] text-text-tertiary">
                      {isExpanded ? '[-]' : '[+]'}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeAgent(agent)}
                      className="text-[length:var(--font-size-xs)] text-status-blocked opacity-60 hover:opacity-100 focus-visible:outline-none"
                      aria-label={`Remove ${agent}`}
                    >
                      remove
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-[var(--spacing-3)] pb-[var(--spacing-3)] border-t border-border-divider pt-[var(--spacing-2)] flex flex-col gap-[var(--spacing-3)]">
                    {/* Categories */}
                    <div>
                      <span className="text-[length:var(--font-size-xs)] font-[var(--font-weight-medium)] text-text-secondary block mb-[var(--spacing-1)]">
                        Categories
                        <span className="font-normal text-text-tertiary ml-[var(--spacing-1)]">
                          (default: {defaultCats.join(', ') || 'none'})
                        </span>
                      </span>
                      <div className="flex flex-wrap gap-[var(--spacing-1-5)]">
                        {defaults.validCategories.map((cat) => {
                          const checked = (mapping.categories ?? defaultCats).includes(cat);
                          return (
                            <label
                              key={cat}
                              className="flex items-center gap-[var(--spacing-1)] text-[length:var(--font-size-xs)] text-text-primary cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  const current = mapping.categories ?? [...defaultCats];
                                  const next = checked
                                    ? current.filter((c) => c !== cat)
                                    : [...current, cat];
                                  updateMapping(agent, { categories: next });
                                }}
                                className="accent-accent-blue"
                              />
                              {cat}
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    {/* Include Keywords */}
                    <div>
                      <span className="text-[length:var(--font-size-xs)] font-[var(--font-weight-medium)] text-text-secondary block mb-[var(--spacing-1)]">
                        Include Keywords
                      </span>
                      <div className="flex flex-wrap items-center gap-[var(--spacing-1)]">
                        {(mapping.includeKeywords ?? []).map((kw, i) => (
                          <TagChip
                            key={`${kw}-${i}`}
                            label={kw}
                            variant="include"
                            onRemove={() =>
                              updateMapping(agent, {
                                includeKeywords: mapping.includeKeywords!.filter((_, idx) => idx !== i),
                              })
                            }
                          />
                        ))}
                        <TagInput
                          placeholder="Add keyword..."
                          onAdd={(v) =>
                            updateMapping(agent, {
                              includeKeywords: [...(mapping.includeKeywords ?? []), v],
                            })
                          }
                        />
                      </div>
                    </div>

                    {/* Exclude Keywords */}
                    <div>
                      <span className="text-[length:var(--font-size-xs)] font-[var(--font-weight-medium)] text-text-secondary block mb-[var(--spacing-1)]">
                        Exclude Keywords
                      </span>
                      <div className="flex flex-wrap items-center gap-[var(--spacing-1)]">
                        {(mapping.excludeKeywords ?? []).map((kw, i) => (
                          <TagChip
                            key={`${kw}-${i}`}
                            label={kw}
                            variant="exclude"
                            onRemove={() =>
                              updateMapping(agent, {
                                excludeKeywords: mapping.excludeKeywords!.filter((_, idx) => idx !== i),
                              })
                            }
                          />
                        ))}
                        <TagInput
                          placeholder="Add keyword..."
                          onAdd={(v) =>
                            updateMapping(agent, {
                              excludeKeywords: [...(mapping.excludeKeywords ?? []), v],
                            })
                          }
                        />
                      </div>
                    </div>

                    {/* Extra Docs */}
                    <div>
                      <span className="text-[length:var(--font-size-xs)] font-[var(--font-weight-medium)] text-text-secondary block mb-[var(--spacing-1)]">
                        Extra Docs
                      </span>
                      <PathList
                        paths={mapping.extras ?? []}
                        onChange={(extras) => updateMapping(agent, { extras })}
                        placeholder="Add path..."
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Add agent button / selector */}
        {unmappedAgents.length > 0 && (
          <div className="mt-[var(--spacing-2)]">
            {addingAgent ? (
              <div className="flex items-center gap-[var(--spacing-2)]">
                <select
                  className={cn(
                    'px-[var(--spacing-2)] py-[var(--spacing-1)] rounded-[var(--radius-sm)]',
                    'border border-border bg-bg-primary text-text-primary text-[length:var(--font-size-xs)]',
                    'focus:outline-none focus:border-accent-blue',
                  )}
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) {
                      const agent = e.target.value;
                      const defaultCats = defaults.agentCategoryMap[agent] ?? [];
                      updateMapping(agent, { categories: [...defaultCats] });
                      setAddingAgent(false);
                      setExpandedAgents((prev) => ({ ...prev, [agent]: true }));
                    }
                  }}
                >
                  <option value="" disabled>
                    Select agent type...
                  </option>
                  {unmappedAgents.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setAddingAgent(false)}
                  className="text-[length:var(--font-size-xs)] text-text-tertiary hover:text-text-secondary focus-visible:outline-none"
                >
                  cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAddingAgent(true)}
                className={cn(
                  'text-[length:var(--font-size-xs)] font-[var(--font-weight-medium)]',
                  'text-accent-blue hover:underline',
                  'focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)] rounded-[var(--radius-sm)]',
                )}
              >
                + Customize Agent
              </button>
            )}
          </div>
        )}
      </CollapsibleSection>

      {/* --- Category Documents --- */}
      <CollapsibleSection
        title="Category Documents"
        description="Extra spec files and docs injected per category"
        expanded={!!expandedSections['categories']}
        onToggle={() => toggleSection('categories')}
      >
        {configuredCategories.length === 0 && (
          <p className="text-[length:var(--font-size-xs)] text-text-tertiary italic mb-[var(--spacing-2)]">
            No custom category documents configured.
          </p>
        )}

        <div className="flex flex-col gap-[var(--spacing-3)]">
          {configuredCategories.map((cat) => {
            const doc = config.categoryDocs![cat]!;
            const defaultFile = defaults.categoryFileMap[cat];

            return (
              <div key={cat} className="border border-border-divider rounded-[var(--radius-sm)] p-[var(--spacing-3)]">
                <div className="flex items-center justify-between mb-[var(--spacing-2)]">
                  <span className="text-[length:var(--font-size-sm)] font-[var(--font-weight-medium)] text-text-primary">
                    {cat}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeCategory(cat)}
                    className="text-[length:var(--font-size-xs)] text-status-blocked opacity-60 hover:opacity-100 focus-visible:outline-none"
                    aria-label={`Remove ${cat}`}
                  >
                    remove
                  </button>
                </div>

                {defaultFile && (
                  <p className="text-[length:var(--font-size-xs)] text-text-tertiary mb-[var(--spacing-2)]">
                    Default spec: {defaultFile}
                  </p>
                )}

                <div className="flex flex-col gap-[var(--spacing-2)]">
                  <div>
                    <span className="text-[length:var(--font-size-xs)] font-[var(--font-weight-medium)] text-text-secondary block mb-[var(--spacing-1)]">
                      Extra Spec Files
                    </span>
                    <PathList
                      paths={doc.specFiles ?? []}
                      onChange={(specFiles) => updateCategoryDocs(cat, { specFiles })}
                      placeholder="Add spec file..."
                    />
                  </div>
                  <div>
                    <span className="text-[length:var(--font-size-xs)] font-[var(--font-weight-medium)] text-text-secondary block mb-[var(--spacing-1)]">
                      Extra Docs
                    </span>
                    <PathList
                      paths={doc.docs ?? []}
                      onChange={(docs) => updateCategoryDocs(cat, { docs })}
                      placeholder="Add doc path..."
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Add category button / selector */}
        {unconfiguredCategories.length > 0 && (
          <div className="mt-[var(--spacing-2)]">
            {addingCategory ? (
              <div className="flex items-center gap-[var(--spacing-2)]">
                <select
                  className={cn(
                    'px-[var(--spacing-2)] py-[var(--spacing-1)] rounded-[var(--radius-sm)]',
                    'border border-border bg-bg-primary text-text-primary text-[length:var(--font-size-xs)]',
                    'focus:outline-none focus:border-accent-blue',
                  )}
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) {
                      updateCategoryDocs(e.target.value, { specFiles: [], docs: [] });
                      setAddingCategory(false);
                    }
                  }}
                >
                  <option value="" disabled>
                    Select category...
                  </option>
                  {unconfiguredCategories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setAddingCategory(false)}
                  className="text-[length:var(--font-size-xs)] text-text-tertiary hover:text-text-secondary focus-visible:outline-none"
                >
                  cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAddingCategory(true)}
                className={cn(
                  'text-[length:var(--font-size-xs)] font-[var(--font-weight-medium)]',
                  'text-accent-blue hover:underline',
                  'focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)] rounded-[var(--radius-sm)]',
                )}
              >
                + Add Category
              </button>
            )}
          </div>
        )}
      </CollapsibleSection>

      {/* --- Always Inject --- */}
      <CollapsibleSection
        title="Always Inject"
        description="File paths injected into every agent context"
        expanded={!!expandedSections['always']}
        onToggle={() => toggleSection('always')}
      >
        <PathList
          paths={config.always ?? []}
          onChange={(always) => setConfig((prev) => ({ ...prev, always: always.length > 0 ? always : undefined }))}
          placeholder="Add file path..."
        />
      </CollapsibleSection>

      {/* --- Global Keyword Filters --- */}
      <CollapsibleSection
        title="Global Keyword Filters"
        description="Include or exclude spec entries by keyword across all agents"
        expanded={!!expandedSections['keywords']}
        onToggle={() => toggleSection('keywords')}
      >
        <div className="flex flex-col gap-[var(--spacing-3)]">
          <div>
            <span className="text-[length:var(--font-size-xs)] font-[var(--font-weight-medium)] text-text-secondary block mb-[var(--spacing-1)]">
              Include Keywords
            </span>
            <div className="flex flex-wrap items-center gap-[var(--spacing-1)]">
              {(config.keywordFilters?.include ?? []).map((kw, i) => (
                <TagChip
                  key={`${kw}-${i}`}
                  label={kw}
                  variant="include"
                  onRemove={() =>
                    setConfig((prev) => ({
                      ...prev,
                      keywordFilters: {
                        ...prev.keywordFilters,
                        include: (prev.keywordFilters?.include ?? []).filter((_, idx) => idx !== i),
                      },
                    }))
                  }
                />
              ))}
              <TagInput
                placeholder="Add keyword..."
                onAdd={(v) =>
                  setConfig((prev) => ({
                    ...prev,
                    keywordFilters: {
                      ...prev.keywordFilters,
                      include: [...(prev.keywordFilters?.include ?? []), v],
                    },
                  }))
                }
              />
            </div>
          </div>

          <div>
            <span className="text-[length:var(--font-size-xs)] font-[var(--font-weight-medium)] text-text-secondary block mb-[var(--spacing-1)]">
              Exclude Keywords
            </span>
            <div className="flex flex-wrap items-center gap-[var(--spacing-1)]">
              {(config.keywordFilters?.exclude ?? []).map((kw, i) => (
                <TagChip
                  key={`${kw}-${i}`}
                  label={kw}
                  variant="exclude"
                  onRemove={() =>
                    setConfig((prev) => ({
                      ...prev,
                      keywordFilters: {
                        ...prev.keywordFilters,
                        exclude: (prev.keywordFilters?.exclude ?? []).filter((_, idx) => idx !== i),
                      },
                    }))
                  }
                />
              ))}
              <TagInput
                placeholder="Add keyword..."
                onAdd={(v) =>
                  setConfig((prev) => ({
                    ...prev,
                    keywordFilters: {
                      ...prev.keywordFilters,
                      exclude: [...(prev.keywordFilters?.exclude ?? []), v],
                    },
                  }))
                }
              />
            </div>
          </div>

          {/* Max Content Length */}
          <div className="flex items-center gap-[var(--spacing-3)]">
            <span className="text-[length:var(--font-size-xs)] font-[var(--font-weight-medium)] text-text-secondary">
              Max Content Length
            </span>
            <input
              type="number"
              value={config.maxContentLength ?? ''}
              onChange={(e) => {
                const val = e.target.value ? parseInt(e.target.value, 10) : undefined;
                setConfig((prev) => ({
                  ...prev,
                  maxContentLength: val && val > 0 ? val : undefined,
                }));
              }}
              placeholder="8000"
              className={cn(
                'w-24 px-[var(--spacing-2)] py-[var(--spacing-1)] rounded-[var(--radius-sm)]',
                'border border-border bg-bg-primary text-text-primary text-[length:var(--font-size-xs)]',
                'focus:outline-none focus:border-accent-blue focus:shadow-[var(--shadow-focus-ring)]',
                'transition-colors duration-[var(--duration-fast)]',
              )}
            />
          </div>
        </div>
      </CollapsibleSection>

      <SettingsSaveBar
        dirty={isDirty}
        saving={saving}
        onSave={() => void handleSave()}
        onDiscard={handleDiscard}
      />
    </div>
  );
}
