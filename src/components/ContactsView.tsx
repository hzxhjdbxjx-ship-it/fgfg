import React, { useState, useRef } from 'react';
import { AppContact } from '../types';
import { 
  Users, Search, Phone, PhoneCall, Plus, Upload, Filter, 
  ChevronLeft, ChevronRight, Check, X, Building, Mail, Smartphone,
  BookOpen, Trash2, FileSpreadsheet, AlertCircle, Calendar
} from 'lucide-react';

interface ContactsViewProps {
  contacts: AppContact[];
  onCallContact: (contact: AppContact) => void;
  onAddContact: (contact: AppContact) => void;
  onImportContacts?: (contacts: AppContact[]) => void;
  onDeleteContact?: (id: string) => void;
  onClearContacts?: () => void;
  onSendToScheduler?: (contacts: AppContact[]) => void;
  onBack: () => void;
}

export const ContactsView: React.FC<ContactsViewProps> = ({
  contacts,
  onCallContact,
  onAddContact,
  onImportContacts,
  onDeleteContact,
  onClearContacts,
  onSendToScheduler,
  onBack
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [phonebookNotice, setPhonebookNotice] = useState<string | null>(null);

  // Single Add Form
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newCompany, setNewCompany] = useState('');
  const [newCategory, setNewCategory] = useState('Lead');

  // Import modal state
  const [pasteText, setPasteText] = useState('');
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Filtered contacts
  const filtered = contacts.filter((c) => {
    const matchesSearch = 
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.phone.includes(searchTerm) ||
      (c.company && c.company.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = selectedCategory === 'all' || c.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const displayed = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleCreateContact = () => {
    if (!newName.trim() || !newPhone.trim()) return;
    const newC: AppContact = {
      id: `cnt-${Date.now()}`,
      name: newName.trim(),
      phone: newPhone.trim(),
      company: newCompany.trim() || 'Direct Client',
      category: newCategory,
      email: `${newName.toLowerCase().replace(/\s+/g, '')}@telecom.local`,
      lastCalled: 'Never'
    };
    onAddContact(newC);
    setShowAddModal(false);
    setNewName('');
    setNewPhone('');
    setNewCompany('');
  };

  // Modern Contact Picker API (native phone address book on supported mobile browsers)
  const handleSelectFromPhonebook = async () => {
    if ('contacts' in navigator && 'ContactsManager' in window) {
      try {
        const props = ['name', 'tel'];
        const opts = { multiple: true };
        // @ts-ignore
        const selected = await (navigator as any).contacts.select(props, opts);
        if (selected && selected.length > 0) {
          const imported: AppContact[] = selected.map((item: any, idx: number) => {
            const name = Array.isArray(item.name) ? item.name[0] : (item.name || `Contact ${idx + 1}`);
            const phone = Array.isArray(item.tel) ? item.tel[0] : (item.tel || '');
            return {
              id: `cnt-pb-${Date.now()}-${idx}`,
              name: name || 'Phonebook Contact',
              phone: phone,
              company: 'Phonebook Contact',
              category: 'Lead',
              email: '',
              lastCalled: 'Never'
            };
          }).filter((c: AppContact) => Boolean(c.phone));

          if (imported.length > 0) {
            if (onImportContacts) {
              onImportContacts(imported);
            } else {
              imported.forEach(c => onAddContact(c));
            }
            setPhonebookNotice(`Successfully imported ${imported.length} contacts from your phonebook!`);
            setTimeout(() => setPhonebookNotice(null), 3500);
            return;
          }
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.warn('Contact picker error:', err);
        }
      }
    } else {
      // Browser does not support native Contact Picker API (e.g. desktop)
      setPhonebookNotice('Phonebook Picker API is supported on mobile Chrome/Android. Please use file import (CSV, VCF, or Paste) on desktop.');
      setTimeout(() => setPhonebookNotice(null), 5000);
      setShowImportModal(true);
    }
  };

  // Helper to parse text lines
  const parseContactsFromText = (raw: string): AppContact[] => {
    const lines = raw.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);
    const results: AppContact[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Regex for phone numbers
      const phoneMatch = line.match(/(\+?[\d\s\-\(\).]{7,25})/);
      if (phoneMatch) {
        const phone = phoneMatch[1].trim();
        let name = line.replace(phoneMatch[1], '').replace(/[,;:|\t]/g, '').trim();
        if (!name) {
          name = `Client ${results.length + 1}`;
        }
        results.push({
          id: `cnt-imp-${Date.now()}-${i}`,
          name: name,
          phone: phone,
          company: 'Imported List',
          category: 'Lead',
          lastCalled: 'Never'
        });
      }
    }
    return results;
  };

  // File upload handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setPasteText(content);
      }
    };
    reader.readAsText(file);
  };

  const handleExecuteImport = () => {
    const parsed = parseContactsFromText(pasteText);
    if (parsed.length === 0) {
      setImportStatus('No valid phone numbers found in the text or file.');
      setTimeout(() => setImportStatus(null), 3000);
      return;
    }

    if (onImportContacts) {
      onImportContacts(parsed);
    } else {
      parsed.forEach(c => onAddContact(c));
    }

    setImportStatus(`Successfully added ${parsed.length} contacts!`);
    setPasteText('');
    setTimeout(() => {
      setImportStatus(null);
      setShowImportModal(false);
    }, 1500);
  };

  return (
    <div className="w-full flex flex-col gap-4 pb-8">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Back</span>
          </button>

          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2 ml-2">
            <Users className="w-5 h-5 text-sky-600" />
            <span>Contacts Directory ({contacts.length.toLocaleString()})</span>
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {/* Send All to Auto-Dial Scheduler */}
          {contacts.length > 0 && onSendToScheduler && (
            <button
              onClick={() => onSendToScheduler(contacts)}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold shadow-sm transition active:scale-95 whitespace-nowrap"
              title="Push all contacts directly to Auto-Dial Campaign Scheduler queue"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Send All to Scheduler ({contacts.length})</span>
            </button>
          )}

          {/* Select from Phonebook button */}
          <button
            onClick={handleSelectFromPhonebook}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition active:scale-95"
            title="Select contacts directly from your mobile phone address book"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Phonebook</span>
          </button>

          {/* Import Files Button */}
          <button
            onClick={() => setShowImportModal(true)}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold shadow-sm transition active:scale-95"
            title="Import contacts from CSV, VCF (vCard), or text files"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import</span>
          </button>

          {/* Add Single Contact */}
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-sm transition active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add</span>
          </button>
        </div>
      </div>

      {/* Phonebook notification banner if triggered */}
      {phonebookNotice && (
        <div className="p-3 rounded-lg bg-sky-50 border border-sky-200 text-xs text-sky-900 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-sky-600 shrink-0" />
          <span>{phonebookNotice}</span>
        </div>
      )}

      {/* Search & Category Filter */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search contacts by name, company, or phone..."
            className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-sky-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={selectedCategory}
            onChange={(e) => {
              setSelectedCategory(e.target.value);
              setCurrentPage(1);
            }}
            className="flex-1 sm:flex-initial bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 outline-none focus:border-sky-500"
          >
            <option value="all">All Categories</option>
            <option value="Lead">Leads</option>
            <option value="Customer">Customers</option>
            <option value="VIP Partner">VIP Partners</option>
            <option value="Scheduled Appointment">Scheduled</option>
            <option value="Needs Followup">Needs Follow-up</option>
          </select>

          {contacts.length > 0 && onClearContacts && (
            <button
              onClick={() => {
                onClearContacts();
              }}
              title="Delete all contacts"
              className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg border border-rose-200 transition text-xs flex items-center gap-1 cursor-pointer font-semibold"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Clear All</span>
            </button>
          )}
        </div>
      </div>

      {/* Contacts List */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden divide-y divide-slate-100">
        {displayed.length === 0 ? (
          <div className="p-10 text-center flex flex-col items-center justify-center gap-3">
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">No contacts in directory</p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm">
                Select contacts from your phonebook or import contacts from CSV/VCF/TXT files to begin auto-dialing.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
              <button
                onClick={handleSelectFromPhonebook}
                className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm flex items-center gap-1.5 transition"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Select from Phonebook</span>
              </button>
              <button
                onClick={() => setShowImportModal(true)}
                className="px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs shadow-sm flex items-center gap-1.5 transition"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Import Files (CSV / VCF)</span>
              </button>
              <button
                onClick={() => setShowAddModal(true)}
                className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs shadow-sm flex items-center gap-1.5 transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Contact</span>
              </button>
            </div>
          </div>
        ) : (
          displayed.map((contact) => (
            <div
              key={contact.id}
              className="p-3.5 flex items-center justify-between gap-3 hover:bg-slate-50/80 transition"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-full bg-sky-100 text-sky-700 font-bold text-xs flex items-center justify-center shrink-0">
                  {contact.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'CT'}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-slate-900 truncate">
                      {contact.name}
                    </span>
                    {contact.category && (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                        {contact.category}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5 font-mono">
                    <span>{contact.phone}</span>
                    {contact.company && (
                      <span className="font-sans text-slate-400 truncate">
                        · {contact.company}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {/* Send to Scheduler button */}
                {onSendToScheduler && (
                  <button
                    onClick={() => onSendToScheduler([contact])}
                    title={`Send ${contact.name} to Auto-Dial Scheduler`}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-800 font-bold text-xs border border-teal-200 shadow-sm transition active:scale-95"
                  >
                    <Calendar className="w-3.5 h-3.5 text-teal-600" />
                    <span>To Scheduler</span>
                  </button>
                )}

                {/* Direct Call */}
                <button
                  onClick={() => onCallContact(contact)}
                  title={`Call ${contact.name}`}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition active:scale-95"
                >
                  <PhoneCall className="w-3.5 h-3.5 text-white" />
                  <span>Direct Call</span>
                </button>

                {/* Delete button */}
                {onDeleteContact && (
                  <button
                    onClick={() => onDeleteContact(contact.id)}
                    title="Delete contact"
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-2 text-xs text-slate-600 font-medium">
          <span>
            Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, filtered.length)} of {filtered.length.toLocaleString()}
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 transition"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-mono text-xs">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 transition"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Add Contact Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white rounded-xl p-5 shadow-xl flex flex-col gap-4 border border-slate-200">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">Add New Contact</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Full Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Johnathan Smith"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Phone Number</label>
                <input
                  type="text"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="e.g. +1 (555) 234-5678"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 outline-none focus:border-sky-500 font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Company / Note</label>
                <input
                  type="text"
                  value={newCompany}
                  onChange={(e) => setNewCompany(e.target.value)}
                  placeholder="e.g. Direct Client"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Category</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 outline-none focus:border-sky-500"
                >
                  <option value="Lead">Lead</option>
                  <option value="Customer">Customer</option>
                  <option value="VIP Partner">VIP Partner</option>
                  <option value="Scheduled Appointment">Scheduled Appointment</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-xs hover:bg-slate-200 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateContact}
                disabled={!newName.trim() || !newPhone.trim()}
                className="px-4 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-semibold text-xs shadow-sm transition disabled:opacity-40"
              >
                Save Contact
              </button>
            </div>
          </div>
        </div>
      )}

      {/* File & Batch Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-white rounded-xl p-5 shadow-xl flex flex-col gap-4 border border-slate-200">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-emerald-600" />
                <h3 className="text-sm font-bold text-slate-900">Import Contacts & Numbers</h3>
              </div>
              <button
                onClick={() => setShowImportModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick action buttons */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-center gap-2 p-3 rounded-lg border-2 border-dashed border-emerald-300 bg-emerald-50/50 hover:bg-emerald-50 text-emerald-800 text-xs font-semibold transition"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <span>Upload CSV / VCF / TXT</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.vcf,.txt,.tsv"
                className="hidden"
                onChange={handleFileUpload}
              />

              <button
                onClick={handleSelectFromPhonebook}
                className="flex items-center justify-center gap-2 p-3 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 text-xs font-semibold transition"
              >
                <BookOpen className="w-4 h-4 text-sky-600" />
                <span>From Phonebook</span>
              </button>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Paste Phone Numbers or Upload File Content:
              </label>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                rows={6}
                placeholder={`Paste numbers here (one per line, comma or tab separated):\n+12345678900, Recipient\n+19876543210, Contact\n+14150001122`}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 font-mono outline-none focus:border-emerald-500"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                Format: <code>Phone</code> or <code>Name, Phone</code> or <code>Phone, Name</code>
              </span>
            </div>

            {importStatus && (
              <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-semibold">
                {importStatus}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setShowImportModal(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-xs hover:bg-slate-200 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteImport}
                disabled={!pasteText.trim()}
                className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition disabled:opacity-40"
              >
                Import Contacts
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
