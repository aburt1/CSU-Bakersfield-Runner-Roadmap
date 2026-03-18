import { useState } from 'react';
import TagEditor from './TagEditor';
import RichTextEditor from './RichTextEditor';

export default function StepForm({ step, onSave, onCancel }) {
  const [title, setTitle] = useState(step?.title || '');
  const [icon, setIcon] = useState(step?.icon || '');
  const [description, setDescription] = useState(step?.description || '');
  const [deadline, setDeadline] = useState(step?.deadline || '');
  const [deadlineDate, setDeadlineDate] = useState(step?.deadline_date || '');
  const [guideContent, setGuideContent] = useState(step?.guide_content || '');
  const [requiredTags, setRequiredTags] = useState(
    step?.required_tags
      ? (typeof step.required_tags === 'string' ? JSON.parse(step.required_tags) : step.required_tags)
      : []
  );
  const [sortOrder, setSortOrder] = useState(step?.sort_order ?? '');
  const [isPublic, setIsPublic] = useState(step?.is_public === 1);

  const existingContact = step?.contact_info
    ? (typeof step.contact_info === 'string' ? JSON.parse(step.contact_info) : step.contact_info)
    : {};
  const [contactName, setContactName] = useState(existingContact?.name || '');
  const [contactEmail, setContactEmail] = useState(existingContact?.email || '');
  const [contactPhone, setContactPhone] = useState(existingContact?.phone || '');

  const handleSubmit = (e) => {
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
      links: null, // links are now embedded inline via the rich text editor
      required_tags: requiredTags.length > 0 ? requiredTags : null,
      sort_order: sortOrder !== '' ? parseInt(sortOrder, 10) : undefined,
      contact_info: contactInfo,
      is_public: isPublic ? 1 : 0,
    });
  };

  const field = 'w-full px-3 py-2 rounded-lg border border-gray-300 font-body text-sm focus:outline-none focus:ring-1 focus:ring-csub-blue';
  const label = 'block font-body text-xs font-semibold text-csub-blue-dark mb-1';

  return (
    <form onSubmit={handleSubmit} className="space-y-4 bg-white border border-gray-200 rounded-xl p-5">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={label}>Title *</label>
          <input type="text" required value={title} onChange={(e) => setTitle(e.target.value)} className={field} />
        </div>
        <div>
          <label className={label}>Icon (emoji)</label>
          <input type="text" value={icon} onChange={(e) => setIcon(e.target.value)} className={field} placeholder="📋" />
        </div>
      </div>

      <div>
        <label className={label}>Short Description</label>
        <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} className={field} />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className={label}>Deadline (display text)</label>
          <input type="text" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={field} placeholder="e.g. May 1" />
        </div>
        <div>
          <label className={label}>Deadline Date (for countdown)</label>
          <input type="date" value={deadlineDate} onChange={(e) => setDeadlineDate(e.target.value)} className={field} />
        </div>
        <div>
          <label className={label}>Sort Order</label>
          <input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className={field} />
        </div>
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={isPublic}
          onChange={(e) => setIsPublic(e.target.checked)}
          className="w-4 h-4 rounded border-gray-300 text-csub-blue focus:ring-csub-blue"
        />
        <span className="font-body text-sm text-csub-blue-dark">Visible without login (public preview)</span>
      </label>

      <div>
        <label className={label}>Guide Content (detailed instructions — use the toolbar to add links)</label>
        <RichTextEditor value={guideContent} onChange={setGuideContent} />
      </div>

      <div>
        <label className={label}>Required Tags (only show to students with these tags)</label>
        <TagEditor tags={requiredTags} onChange={setRequiredTags} />
      </div>

      {/* Step Contact */}
      <div>
        <label className={label}>Step Contact (optional — shown to students for this step)</label>
        <div className="grid grid-cols-3 gap-3">
          <input type="text" value={contactName} onChange={(e) => setContactName(e.target.value)} className={field} placeholder="Contact name" />
          <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className={field} placeholder="Email" />
          <input type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className={field} placeholder="Phone" />
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          className="bg-csub-blue hover:bg-csub-blue-dark text-white font-display font-bold uppercase tracking-wider px-6 py-2.5 rounded-lg shadow transition-colors text-sm"
        >
          {step ? 'Save Changes' : 'Create Step'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="border border-gray-300 text-csub-gray hover:text-csub-blue-dark font-body px-6 py-2.5 rounded-lg transition-colors text-sm"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
