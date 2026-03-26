import { useEffect, useMemo, useRef, useState, type FormEvent, type ChangeEvent, type ReactNode } from 'react';
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';
import TagEditor from './TagEditor';
import RichTextEditor from './RichTextEditor';
import ApiCheckConfig from './ApiCheckConfig';

interface AdminApi {
  get: (path: string, params?: Record<string, any>) => Promise<any>;
  post: (path: string, body?: any) => Promise<any>;
  put: (path: string, body?: any) => Promise<any>;
  del: (path: string, body?: any) => Promise<any>;
  raw: (path: string, options?: any) => Promise<Response>;
}

interface StepData {
  id?: number;
  title?: string;
  icon?: string;
  description?: string;
  deadline?: string;
  deadline_date?: string;
  guide_content?: string;
  required_tags?: string | string[] | null;
  required_tag_mode?: string;
  excluded_tags?: string | string[] | null;
  sort_order?: number;
  is_public?: number;
  is_optional?: number;
  contact_info?: string | { name?: string; email?: string; phone?: string };
  term_id?: number | null;
}

interface Props {
  step: StepData | null;
  onSave: (data: Record<string, any>) => void;
  onCancel: () => void;
  selectedTermId?: number | null;
  role?: string;
  api?: AdminApi;
}

const TAG_PRESETS = [
  'freshman', 'transfer', 'first-gen', 'honors',
  'athlete', 'eop', 'veteran', 'out-of-state',
];

function parseJsonArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    return JSON.parse(value as string);
  } catch {
    return [];
  }
}

interface QuickTagPillsProps {
  onAddTag: (tag: string) => void;
  tags: string[];
}

function QuickTagPills({ onAddTag, tags }: QuickTagPillsProps) {
  return (
    <div className="flex flex-wrap gap-1.5 mb-2">
      {TAG_PRESETS.map((tag) => {
        const selected = tags.includes(tag);
        return (
          <button
            key={tag}
            type="button"
            onClick={() => onAddTag(tag)}
            className={`text-xs font-body font-semibold rounded-full px-2 py-1 transition-colors ${
              selected
                ? 'bg-csub-blue text-white ring-2 ring-csub-blue/15'
                : 'bg-csub-blue/10 text-csub-blue-dark hover:bg-csub-blue/15'
            }`}
          >
            {selected ? `${tag} \u2713` : tag}
          </button>
        );
      })}
    </div>
  );
}

interface SectionProps {
  title: string;
  description?: string;
  children: ReactNode;
}

function Section({ title, description, children }: SectionProps) {
  return (
    <section className="bg-gray-50/70 border border-gray-200 rounded-xl p-4 space-y-4">
      <div>
        <h3 className="font-display text-sm font-bold uppercase tracking-wide text-csub-blue-dark">
          {title}
        </h3>
        {description && (
          <p className="font-body text-xs text-csub-gray mt-1">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}

export default function StepForm({ step, onSave, onCancel, selectedTermId, role, api }: Props) {
  const iconPickerRef = useRef<HTMLDivElement>(null);
  const [title, setTitle] = useState(step?.title || '');
  const [icon, setIcon] = useState(step?.icon || '\uD83D\uDCCB');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [description, setDescription] = useState(step?.description || '');
  const [deadline, setDeadline] = useState(step?.deadline || '');
  const [deadlineDate, setDeadlineDate] = useState(step?.deadline_date || '');
  const [guideContent, setGuideContent] = useState(step?.guide_content || '');
  const [requiredTags, setRequiredTags] = useState<string[]>(parseJsonArray(step?.required_tags));
  const [requiredTagMode, setRequiredTagMode] = useState(step?.required_tag_mode === 'all' ? 'all' : 'any');
  const [excludedTags, setExcludedTags] = useState<string[]>(parseJsonArray(step?.excluded_tags));
  const [sortOrder, setSortOrder] = useState<string | number>(step?.sort_order ?? '');
  const [isPublic, setIsPublic] = useState(step?.is_public === 1);
  const [isOptional, setIsOptional] = useState(step?.is_optional === 1);
  const [showAdvancedRules, setShowAdvancedRules] = useState(parseJsonArray(step?.excluded_tags).length > 0);

  const existingContact = step?.contact_info
    ? (typeof step.contact_info === 'string' ? JSON.parse(step.contact_info) : step.contact_info)
    : {};
  const [contactName, setContactName] = useState(existingContact?.name || '');
  const [contactEmail, setContactEmail] = useState(existingContact?.email || '');
  const [contactPhone, setContactPhone] = useState(existingContact?.phone || '');
  const [termId, setTermId] = useState<number | null>(step?.term_id ?? selectedTermId ?? null);

  useEffect(() => {
    setTermId(step?.term_id ?? selectedTermId ?? null);
  }, [step?.term_id, selectedTermId]);

  useEffect(() => {
    if (!showEmojiPicker) return undefined;

    const handleClickOutside = (event: MouseEvent) => {
      if (!iconPickerRef.current?.contains(event.target as Node)) {
        setShowEmojiPicker(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showEmojiPicker]);

  const field = 'w-full px-3 py-2 rounded-lg border border-gray-300 bg-white font-body text-sm focus:outline-none focus:ring-1 focus:ring-csub-blue';
  const label = 'block font-body text-xs font-semibold text-csub-blue-dark mb-1';

  const visibilitySummary = useMemo(() => {
    if (requiredTags.length === 0 && excludedTags.length === 0) {
      return 'This step is visible to all students in the selected term.';
    }

    const parts: string[] = [];
    if (requiredTags.length > 0) {
      parts.push(
        requiredTagMode === 'all'
          ? `Visible only to students who have every selected tag: ${requiredTags.join(', ')}.`
          : `Visible to students who have at least one selected tag: ${requiredTags.join(', ')}.`
      );
    } else {
      parts.push('Visible to all students.');
    }

    if (excludedTags.length > 0) {
      parts.push(`Hidden for students with: ${excludedTags.join(', ')}.`);
    }

    return parts.join(' ');
  }, [excludedTags, requiredTagMode, requiredTags]);

  const addTag = (tags: string[], setTags: (tags: string[]) => void, tag: string) => {
    if (!tags.includes(tag)) setTags([...tags, tag]);
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const contactInfo = (contactName || contactEmail || contactPhone)
      ? { name: contactName || null, email: contactEmail || null, phone: contactPhone || null }
      : null;

    onSave({
      title,
      icon: icon || null,
      description: description || null,
      deadline: deadline || null,
      deadline_date: deadlineDate || null,
      guide_content: guideContent || null,
      links: null,
      required_tags: requiredTags.length > 0 ? requiredTags : null,
      required_tag_mode: requiredTagMode,
      excluded_tags: excludedTags.length > 0 ? excludedTags : null,
      sort_order: sortOrder !== '' ? parseInt(String(sortOrder), 10) : undefined,
      contact_info: contactInfo,
      term_id: termId,
      is_public: isPublic ? 1 : 0,
      is_optional: isOptional ? 1 : 0,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 bg-white border border-gray-200 rounded-xl p-5">
      <Section title="Step Details" description="Start with the content and icon students will see.">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4 items-start">
          <div>
            <label className={label}>Title *</label>
            <input type="text" required value={title} onChange={(e: ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)} className={field} />
          </div>
          <div className="sm:w-48">
            <label className={label}>Icon</label>
            <div className="relative" ref={iconPickerRef}>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-md bg-gray-50 border border-gray-200 flex items-center justify-center text-xl pointer-events-none">
                  {icon || '\uD83D\uDCCB'}
                </span>
                <input type="text" value="" onFocus={() => setShowEmojiPicker(true)} onChange={() => {}} className={`${field} pl-14`} placeholder={icon ? 'Change emoji' : 'Choose emoji'} readOnly />
              </div>
              {showEmojiPicker && (
                <div className="absolute z-20 top-full mt-2">
                  <div className="rounded-2xl overflow-hidden shadow-xl border border-gray-200">
                    <Picker
                      data={data}
                      onEmojiSelect={(emoji: any) => { setIcon(emoji.native); setShowEmojiPicker(false); }}
                      previewPosition="none"
                      searchPosition="sticky"
                      navPosition="top"
                      perLine={8}
                      emojiButtonSize={36}
                      emojiSize={22}
                      maxFrequentRows={2}
                      categories={['frequent', 'people', 'activity', 'objects', 'symbols', 'flags']}
                      theme="light"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        <div>
          <label className={label}>Short Description</label>
          <input type="text" value={description} onChange={(e: ChangeEvent<HTMLInputElement>) => setDescription(e.target.value)} className={field} placeholder="One sentence that explains what the student needs to do." />
        </div>
        <div>
          <label className={label}>Guide Content</label>
          <RichTextEditor value={guideContent} onChange={setGuideContent} />
        </div>
      </Section>

      <Section title="Visibility" description="Describe who should see this step. The app still uses tags underneath.">
        <div className="bg-white border border-csub-blue/10 rounded-xl p-3">
          <p className="font-body text-sm text-csub-blue-dark">{visibilitySummary}</p>
        </div>
        <div>
          <label className={label}>Show This Step For</label>
          <p className="font-body text-xs text-csub-gray mb-2">Leave empty to show the step to everyone in the term.</p>
          <QuickTagPills tags={requiredTags} onAddTag={(tag) => addTag(requiredTags, setRequiredTags, tag)} />
          <TagEditor tags={requiredTags} onChange={setRequiredTags} />
        </div>
        {requiredTags.length > 1 ? (
          <div className="space-y-3">
            <div>
              <p className="font-body text-xs font-semibold text-csub-blue-dark">If a student has multiple audience tags</p>
              <p className="font-body text-xs text-csub-gray mt-1">Choose whether matching one tag is enough, or whether they need every selected tag.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button type="button" onClick={() => setRequiredTagMode('any')} className={`text-left rounded-xl border px-4 py-3 transition-colors ${requiredTagMode === 'any' ? 'border-csub-blue bg-csub-blue/5 ring-1 ring-csub-blue' : 'border-gray-300 bg-white hover:border-csub-blue/40'}`}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-body text-sm font-semibold text-csub-blue-dark">Match any selected tag</p>
                  {requiredTagMode === 'any' && <span className="font-body text-xs font-semibold text-csub-blue">Active</span>}
                </div>
                <p className="font-body text-xs text-csub-gray mt-2">A student sees this step if they match at least one of the selected tags.</p>
              </button>
              <button type="button" onClick={() => setRequiredTagMode('all')} className={`text-left rounded-xl border px-4 py-3 transition-colors ${requiredTagMode === 'all' ? 'border-csub-blue bg-csub-blue/5 ring-1 ring-csub-blue' : 'border-gray-300 bg-white hover:border-csub-blue/40'}`}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-body text-sm font-semibold text-csub-blue-dark">Match every selected tag</p>
                  {requiredTagMode === 'all' && <span className="font-body text-xs font-semibold text-csub-blue">Active</span>}
                </div>
                <p className="font-body text-xs text-csub-gray mt-2">A student only sees this step if they match all of the selected tags.</p>
              </button>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg px-3 py-2">
              <p className="font-body text-xs text-csub-gray">
                {requiredTagMode === 'all' ? 'Right now, a student would need every selected audience tag to see this step.' : 'Right now, a student would only need one of the selected audience tags to see this step.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="bg-white border border-dashed border-gray-300 rounded-lg px-3 py-2">
            <p className="font-body text-xs text-csub-gray">Add two or more audience tags if you want to choose between matching one tag or all tags.</p>
          </div>
        )}
        <div>
          <button type="button" onClick={() => setShowAdvancedRules((prev) => !prev)} className="font-body text-sm font-semibold text-csub-blue hover:text-csub-blue-dark transition-colors">
            {showAdvancedRules ? 'Hide advanced visibility' : 'Show advanced visibility'}
          </button>
        </div>
        {showAdvancedRules && (
          <div>
            <label className={label}>Hide This Step For</label>
            <p className="font-body text-xs text-csub-gray mb-2">Students with any of these tags will not see this step.</p>
            <QuickTagPills tags={excludedTags} onAddTag={(tag) => addTag(excludedTags, setExcludedTags, tag)} />
            <TagEditor tags={excludedTags} onChange={setExcludedTags} />
          </div>
        )}
      </Section>

      <Section title="Settings" description="Secondary options for timing and preview behavior.">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className={label}>Deadline Label</label>
            <input type="text" value={deadline} onChange={(e: ChangeEvent<HTMLInputElement>) => setDeadline(e.target.value)} className={field} placeholder="e.g. May 1" />
          </div>
          <div>
            <label className={label}>Deadline Date</label>
            <input type="date" value={deadlineDate} onChange={(e: ChangeEvent<HTMLInputElement>) => setDeadlineDate(e.target.value)} className={field} />
          </div>
          <div>
            <label className={label}>Sort Order</label>
            <input type="number" value={sortOrder} onChange={(e: ChangeEvent<HTMLInputElement>) => setSortOrder(e.target.value)} className={field} />
          </div>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={isPublic} onChange={(e: ChangeEvent<HTMLInputElement>) => setIsPublic(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-csub-blue focus:ring-csub-blue" />
          <span className="font-body text-sm text-csub-blue-dark">Show in the public preview before login</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={isOptional} onChange={(e: ChangeEvent<HTMLInputElement>) => setIsOptional(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-csub-blue focus:ring-csub-blue" />
          <span className="font-body text-sm text-csub-blue-dark">Optional opportunity</span>
        </label>
      </Section>

      <Section title="Support" description="Optional contact details shown to students on this step.">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input type="text" value={contactName} onChange={(e: ChangeEvent<HTMLInputElement>) => setContactName(e.target.value)} className={field} placeholder="Contact name" />
          <input type="email" value={contactEmail} onChange={(e: ChangeEvent<HTMLInputElement>) => setContactEmail(e.target.value)} className={field} placeholder="Email" />
          <input type="tel" value={contactPhone} onChange={(e: ChangeEvent<HTMLInputElement>) => setContactPhone(e.target.value)} className={field} placeholder="Phone" />
        </div>
      </Section>

      {role === 'sysadmin' && step?.id && api && (
        <ApiCheckConfig stepId={step.id} api={api} />
      )}

      <div className="flex gap-3 pt-2">
        <button type="submit" className="bg-csub-blue hover:bg-csub-blue-dark text-white font-display font-bold uppercase tracking-wider px-6 py-2.5 rounded-lg shadow transition-colors text-sm">
          {step ? 'Save Changes' : 'Create Step'}
        </button>
        <button type="button" onClick={onCancel} className="border border-gray-300 text-csub-gray hover:text-csub-blue-dark font-body px-6 py-2.5 rounded-lg transition-colors text-sm">
          Cancel
        </button>
      </div>
    </form>
  );
}
