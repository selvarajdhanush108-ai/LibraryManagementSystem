import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Search,
  Download,
  Archive,
  ArrowLeft,
  Edit3,
  BookOpen,
  Layers,
} from 'lucide-react';
import { apiRequest, exportToCsv } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { SemanticStatus } from '../components/AppLayout';
import { validateIsbn } from '../utils/libraryRules';

export const AdminBooksListPage: React.FC = () => {
  const { showToast } = useAuth();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [availability, setAvailability] = useState<'all' | 'available' | 'unavailable'>('all');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [page, setPage] = useState(1);

  const { data: catData } = useQuery({
    queryKey: ['categories'],
    queryFn: () => apiRequest('/categories'),
  });

  const { data: booksData, isLoading } = useQuery({
    queryKey: ['books', search, categoryId, availability, includeArchived, page],
    queryFn: () => {
      const qs = new URLSearchParams({
        search,
        categoryId,
        availability,
        includeArchived: String(includeArchived),
        page: String(page),
        pageSize: '15',
      });
      return apiRequest(`/books?${qs.toString()}`);
    },
  });

  const archiveMut = useMutation({
    mutationFn: (bookId: number) => apiRequest(`/books/${bookId}`, { method: 'DELETE' }),
    onSuccess: (res) => {
      showToast('success', 'Book Archived', res.message);
      queryClient.invalidateQueries({ queryKey: ['books'] });
    },
    onError: (err: Error) => {
      showToast('error', 'Archive Blocked', err.message);
    },
  });

  const items = booksData?.items || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-blue-900">Bibliographic Repository</p>
          <h1 className="text-2xl font-bold text-slate-900 mt-0.5">Book Catalog Management</h1>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => exportToCsv('ksrce_catalog_export.csv', items)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
          <Link
            to="/admin/books/new"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0C1D36] hover:bg-blue-900 rounded-md transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add New Book</span>
          </Link>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
        <div className="md:col-span-5 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" aria-hidden="true" />
          <input
            type="search"
            aria-label="Search books by title, ISBN, author, or code"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by title, ISBN-10/13, author, publisher, or code..."
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-md"
          />
        </div>

        <div className="md:col-span-3">
          <select
            aria-label="Filter by category"
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value);
              setPage(1);
            }}
            className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md bg-white"
          >
            <option value="">All Categories</option>
            {(catData?.items || []).map((c: any) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.code})
              </option>
            ))}
          </select>
        </div>

        <div className="md:col-span-2">
          <select
            aria-label="Filter by availability"
            value={availability}
            onChange={(e) => {
              setAvailability(e.target.value as any);
              setPage(1);
            }}
            className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md bg-white"
          >
            <option value="all">All Availability</option>
            <option value="available">Available Now</option>
            <option value="unavailable">All Copies Issued</option>
          </select>
        </div>

        <div className="md:col-span-2 flex items-center justify-end gap-2">
          <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => setIncludeArchived(e.target.checked)}
              className="rounded border-slate-300"
            />
            <span>Show Archived</span>
          </label>
        </div>
      </div>

      {/* Catalog Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4">Code / ISBN</th>
                <th className="py-3 px-4">Title & Authors</th>
                <th className="py-3 px-4">Category & Publisher</th>
                <th className="py-3 px-4">Shelf Rack</th>
                <th className="py-3 px-4 text-right">Copies (Avail/Total)</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    Loading catalog records...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-500">
                    No matching books found in the KSRCE catalog.
                  </td>
                </tr>
              ) : (
                items.map((book: any) => (
                  <tr key={book.id} className="hover:bg-slate-50/90">
                    <td className="py-3 px-4 font-mono tabular-nums">
                      <div className="font-semibold text-blue-900">{book.bookCode}</div>
                      <div className="text-[11px] text-slate-500">{book.isbn || 'No ISBN'}</div>
                    </td>
                    <td className="py-3 px-4">
                      <Link
                        to={`/admin/books/${book.id}`}
                        className="font-semibold text-slate-900 hover:text-blue-800 block"
                      >
                        {book.title}
                      </Link>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {book.authorsText || 'Institutional Compilation'} · {book.edition} ({book.publicationYear})
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-800">{book.categoryName}</div>
                      <div className="text-[11px] text-slate-500">{book.publisherName}</div>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-700 tabular-nums">{book.shelfLocation}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      <span
                        className={`font-bold ${
                          Number(book.availableCopies) > 0 ? 'text-emerald-700' : 'text-amber-700'
                        }`}
                      >
                        {book.availableCopies}
                      </span>
                      <span className="text-slate-400"> / </span>
                      <span className="text-slate-800 font-semibold">{book.totalCopies}</span>
                    </td>
                    <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap">
                      <Link
                        to={`/admin/books/${book.id}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-800 bg-blue-50 hover:bg-blue-100 rounded"
                      >
                        <span>View / Copies</span>
                      </Link>
                      {!book.isArchived && (
                        <button
                          type="button"
                          onClick={() => archiveMut.mutate(book.id)}
                          aria-label={`Archive ${book.title}`}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-600 hover:text-red-700 hover:bg-red-50 rounded"
                        >
                          <Archive className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-600">
          <span className="font-mono tabular-nums">
            Showing {items.length} of {booksData?.totalCount || 0} catalog records
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1 border border-slate-300 bg-white rounded disabled:opacity-40"
            >
              Previous
            </button>
            <span className="font-mono tabular-nums">
              Page {page} of {booksData?.totalPages || 1}
            </span>
            <button
              type="button"
              disabled={page >= (booksData?.totalPages || 1)}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1 border border-slate-300 bg-white rounded disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const AdminBookNewPage: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useAuth();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [isbn, setIsbn] = useState('');
  const [publisherId, setPublisherId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [edition, setEdition] = useState('1st Edition');
  const [publicationYear, setPublicationYear] = useState('2024');
  const [language, setLanguage] = useState('English');
  const [shelfLocation, setShelfLocation] = useState('Rack A-03 / Shelf 1');
  const [description, setDescription] = useState('');
  const [selectedAuthors, setSelectedAuthors] = useState<number[]>([]);
  const [initialCopiesCount, setInitialCopiesCount] = useState('2');
  const [acquisitionPrice, setAcquisitionPrice] = useState('750');
  const [formError, setFormError] = useState<string | null>(null);

  const { data: catData } = useQuery({ queryKey: ['categories'], queryFn: () => apiRequest('/categories') });
  const { data: pubData } = useQuery({ queryKey: ['publishers'], queryFn: () => apiRequest('/publishers') });
  const { data: authData } = useQuery({ queryKey: ['authors'], queryFn: () => apiRequest('/authors') });

  const createBookMut = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiRequest('/books', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: (res) => {
      showToast('success', 'Book Created', `${res.bookCode} added to catalog.`);
      queryClient.invalidateQueries({ queryKey: ['books'] });
      navigate(`/admin/books/${res.id}`);
    },
    onError: (err: Error) => {
      setFormError(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!title.trim() || !publisherId || !categoryId || !publicationYear || !shelfLocation.trim()) {
      setFormError('Title, Category, Publisher, Publication Year, and Shelf Location are required.');
      return;
    }

    const isbnCheck = validateIsbn(isbn);
    if (!isbnCheck.valid) {
      setFormError(isbnCheck.error || 'Invalid ISBN');
      return;
    }

    createBookMut.mutate({
      title: title.trim(),
      subtitle: subtitle.trim() || null,
      isbn: isbn.trim() || null,
      publisherId: Number(publisherId),
      categoryId: Number(categoryId),
      edition: edition.trim(),
      publicationYear: Number(publicationYear),
      language,
      shelfLocation: shelfLocation.trim(),
      description: description.trim() || null,
      authorIds: selectedAuthors,
      initialCopiesCount: Number(initialCopiesCount),
      acquisitionPrice: Number(acquisitionPrice),
    });
  };

  const toggleAuthor = (id: number) => {
    setSelectedAuthors((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <div>
          <Link to="/admin/books" className="inline-flex items-center gap-1 text-xs font-medium text-blue-800 hover:underline">
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Book Catalog</span>
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">Add New Bibliographic Record</h1>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-lg p-6 space-y-5" noValidate>
        {formError && (
          <div role="alert" className="p-3.5 rounded-md bg-red-50 border border-red-200 text-xs font-medium text-red-800">
            {formError}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label htmlFor="bk-title" className="block text-xs font-semibold text-slate-700 mb-1">
              Book Title *
            </label>
            <input
              id="bk-title"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Operating System Concepts"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
            />
          </div>

          <div>
            <label htmlFor="bk-subtitle" className="block text-xs font-semibold text-slate-700 mb-1">
              Subtitle (Optional)
            </label>
            <input
              id="bk-subtitle"
              type="text"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              placeholder="e.g., Tenth International Student Edition"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
            />
          </div>

          <div>
            <label htmlFor="bk-isbn" className="block text-xs font-semibold text-slate-700 mb-1">
              ISBN-10 or ISBN-13 (Validated when supplied)
            </label>
            <input
              id="bk-isbn"
              type="text"
              value={isbn}
              onChange={(e) => setIsbn(e.target.value)}
              placeholder="Leave blank if older monograph, or enter valid ISBN"
              className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md tabular-nums"
            />
          </div>

          <div>
            <label htmlFor="bk-cat" className="block text-xs font-semibold text-slate-700 mb-1">
              Subject Category *
            </label>
            <select
              id="bk-cat"
              required
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white"
            >
              <option value="">Select Category...</option>
              {(catData?.items || []).map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="bk-pub" className="block text-xs font-semibold text-slate-700 mb-1">
              Publisher *
            </label>
            <select
              id="bk-pub"
              required
              value={publisherId}
              onChange={(e) => setPublisherId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white"
            >
              <option value="">Select Publisher...</option>
              {(pubData?.items || []).map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="bk-edition" className="block text-xs font-semibold text-slate-700 mb-1">
              Edition *
            </label>
            <input
              id="bk-edition"
              type="text"
              value={edition}
              onChange={(e) => setEdition(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
            />
          </div>

          <div>
            <label htmlFor="bk-year" className="block text-xs font-semibold text-slate-700 mb-1">
              Publication Year *
            </label>
            <input
              id="bk-year"
              type="number"
              value={publicationYear}
              onChange={(e) => setPublicationYear(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md tabular-nums"
            />
          </div>

          <div>
            <label htmlFor="bk-shelf" className="block text-xs font-semibold text-slate-700 mb-1">
              Rack & Shelf Location *
            </label>
            <input
              id="bk-shelf"
              type="text"
              required
              value={shelfLocation}
              onChange={(e) => setShelfLocation(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md"
            />
          </div>

          <div>
            <label htmlFor="bk-lang" className="block text-xs font-semibold text-slate-700 mb-1">
              Language
            </label>
            <select
              id="bk-lang"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white"
            >
              <option value="English">English</option>
              <option value="Tamil">Tamil</option>
              <option value="Hindi">Hindi</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <span className="block text-xs font-semibold text-slate-700 mb-1.5">
              Select Author(s) (Multiple Authors Supported)
            </span>
            <div className="flex flex-wrap gap-2 p-3 border border-slate-200 rounded-md bg-slate-50 max-h-36 overflow-y-auto">
              {(authData?.items || []).map((a: any) => {
                const checked = selectedAuthors.includes(a.id);
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => toggleAuthor(a.id)}
                    className={`px-2.5 py-1 text-xs rounded border transition-colors ${
                      checked
                        ? 'bg-[#0C1D36] text-white border-[#0C1D36] font-semibold'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    {a.fullName}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="md:col-span-2">
            <label htmlFor="bk-desc" className="block text-xs font-semibold text-slate-700 mb-1">
              Syllabus & Abstract Description
            </label>
            <textarea
              id="bk-desc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
            />
          </div>

          <div>
            <label htmlFor="bk-copies" className="block text-xs font-semibold text-slate-700 mb-1">
              Initial Physical Copies to Auto-Accession (0–20)
            </label>
            <input
              id="bk-copies"
              type="number"
              min={0}
              max={20}
              value={initialCopiesCount}
              onChange={(e) => setInitialCopiesCount(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md tabular-nums"
            />
          </div>

          <div>
            <label htmlFor="bk-price" className="block text-xs font-semibold text-slate-700 mb-1">
              Unit Acquisition Price (₹)
            </label>
            <input
              id="bk-price"
              type="number"
              min={0}
              value={acquisitionPrice}
              onChange={(e) => setAcquisitionPrice(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md tabular-nums"
            />
          </div>
        </div>

        <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
          <Link
            to="/admin/books"
            className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={createBookMut.isPending}
            className="px-5 py-2 text-xs font-semibold text-white bg-[#0C1D36] hover:bg-blue-900 rounded-md"
          >
            {createBookMut.isPending ? 'Saving Catalog Record...' : 'Save Book & Generate Copies'}
          </button>
        </div>
      </form>
    </div>
  );
};

export const AdminBookDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { showToast } = useAuth();
  const queryClient = useQueryClient();

  const [newAccession, setNewAccession] = useState('');
  const [newPrice, setNewPrice] = useState('750');
  const [newShelf, setNewShelf] = useState('');
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editShelf, setEditShelf] = useState('');
  const [editEdition, setEditEdition] = useState('');

  const { data: book, isLoading } = useQuery({
    queryKey: ['book-detail', id],
    queryFn: () => apiRequest(`/books/${id}`),
  });

  const addCopyMut = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiRequest('/copies', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: (res) => {
      showToast('success', 'Copy Added', res.message);
      setNewAccession('');
      queryClient.invalidateQueries({ queryKey: ['book-detail', id] });
    },
    onError: (err: Error) => showToast('error', 'Failed to Add Copy', err.message),
  });

  const updateStatusMut = useMutation({
    mutationFn: ({ copyId, status }: { copyId: number; status: string }) =>
      apiRequest(`/copies/${copyId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    onSuccess: (res) => {
      showToast('success', 'Copy Status Updated', res.message);
      queryClient.invalidateQueries({ queryKey: ['book-detail', id] });
    },
    onError: (err: Error) => showToast('error', 'Invalid Transition', err.message),
  });

  const updateBookMut = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiRequest(`/books/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    onSuccess: () => {
      showToast('success', 'Book Updated', 'Bibliographic metadata saved.');
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ['book-detail', id] });
    },
    onError: (err: Error) => showToast('error', 'Update Failed', err.message),
  });

  if (isLoading || !book) {
    return <div className="p-6 text-sm text-slate-500">Loading book details...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <Link to="/admin/books" className="inline-flex items-center gap-1 text-xs font-medium text-blue-800 hover:underline">
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Catalog</span>
          </Link>
          <div className="flex items-center gap-3 mt-1">
            <h1 className="text-2xl font-bold text-slate-900">{book.title}</h1>
            <span className="font-mono text-xs text-blue-900 font-semibold">{book.bookCode}</span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {book.subtitle ? `${book.subtitle} · ` : ''}
            {book.categoryName} · {book.publisherName} · {book.edition} ({book.publicationYear})
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setEditTitle(book.title);
            setEditShelf(book.shelfLocation);
            setEditEdition(book.edition);
            setEditing((e) => !e);
          }}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md"
        >
          <Edit3 className="w-3.5 h-3.5" />
          <span>{editing ? 'Cancel Edit' : 'Edit Metadata'}</span>
        </button>
      </div>

      {editing && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            updateBookMut.mutate({
              title: editTitle,
              shelfLocation: editShelf,
              edition: editEdition,
            });
          }}
          className="bg-white border border-blue-200 rounded-lg p-5 grid grid-cols-1 md:grid-cols-4 gap-4 items-end"
        >
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">Book Title</label>
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Edition</label>
            <input
              type="text"
              value={editEdition}
              onChange={(e) => setEditEdition(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
            />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Shelf Location</label>
              <input
                type="text"
                value={editShelf}
                onChange={(e) => setEditShelf(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-[#0C1D36] text-white text-xs font-semibold rounded-md hover:bg-blue-900"
            >
              Save
            </button>
          </div>
        </form>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
            <BookOpen className="w-4 h-4 text-blue-800" />
            <span>Bibliographic Identifiers</span>
          </div>
          <dl className="mt-3 space-y-1.5 text-xs">
            <div className="flex justify-between">
              <dt className="text-slate-500">ISBN:</dt>
              <dd className="font-mono font-medium text-slate-900 tabular-nums">{book.isbn || 'N/A'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Authors:</dt>
              <dd className="font-medium text-slate-900 text-right">
                {(book.authors || []).map((a: any) => a.fullName).join(', ') || 'Institutional'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Primary Rack:</dt>
              <dd className="font-mono text-slate-900">{book.shelfLocation}</dd>
            </div>
          </dl>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
            <Layers className="w-4 h-4 text-emerald-700" />
            <span>Physical Copy Holdings</span>
          </div>
          <div className="mt-3 flex items-baseline gap-4 font-mono tabular-nums">
            <div>
              <p className="text-2xl font-bold text-emerald-700">{book.availableCopies}</p>
              <p className="text-xs text-slate-500 font-sans">Available Now</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{book.totalCopies}</p>
              <p className="text-xs text-slate-500 font-sans">Total Copies</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-amber-700">{book.activeReservationsCount}</p>
              <p className="text-xs text-slate-500 font-sans">Active Queue</p>
            </div>
          </div>
        </div>

        {/* Quick Add Physical Copy Box */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!newAccession.trim()) return;
            addCopyMut.mutate({
              bookId: book.id,
              accessionNumber: newAccession.trim(),
              acquisitionPrice: Number(newPrice),
              shelfLocation: newShelf.trim() || book.shelfLocation,
            });
          }}
          className="bg-white border border-slate-200 rounded-lg p-4 space-y-2.5"
        >
          <p className="text-xs font-bold text-slate-900">Accession New Physical Copy</p>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              required
              value={newAccession}
              onChange={(e) => setNewAccession(e.target.value)}
              placeholder="e.g., KSR-ACC-1025"
              aria-label="New Accession Number"
              className="px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded"
            />
            <input
              type="number"
              value={newPrice}
              onChange={(e) => setNewPrice(e.target.value)}
              placeholder="Price (₹)"
              aria-label="Acquisition Price"
              className="px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded tabular-nums"
            />
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newShelf}
              onChange={(e) => setNewShelf(e.target.value)}
              placeholder={book.shelfLocation}
              aria-label="Copy Shelf Location"
              className="flex-1 px-2.5 py-1.5 text-xs border border-slate-300 rounded"
            />
            <button
              type="submit"
              disabled={addCopyMut.isPending}
              className="px-3 py-1.5 bg-[#0C1D36] text-white text-xs font-semibold rounded hover:bg-blue-900"
            >
              Add Copy
            </button>
          </div>
        </form>
      </div>

      {/* Physical Copies Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="text-base font-bold text-slate-900">Individual Physical Copies ({book.copies?.length || 0})</h2>
          <p className="text-xs text-slate-500">Barcoded copies linked to this bibliographic record</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="py-2.5 px-4">Accession No.</th>
                <th className="py-2.5 px-4">Barcode</th>
                <th className="py-2.5 px-4">Shelf Location</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4">Borrower / Notes</th>
                <th className="py-2.5 px-4 text-right">Change Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {(book.copies || []).map((cp: any) => (
                <tr key={cp.id} className="hover:bg-slate-50">
                  <td className="py-2.5 px-4 font-mono font-semibold text-blue-900 tabular-nums">{cp.accessionNumber}</td>
                  <td className="py-2.5 px-4 font-mono text-slate-600 tabular-nums">{cp.barcode}</td>
                  <td className="py-2.5 px-4 font-mono text-slate-700">{cp.shelfLocation}</td>
                  <td className="py-2.5 px-4">
                    <SemanticStatus status={cp.status} />
                  </td>
                  <td className="py-2.5 px-4 text-slate-600">
                    {cp.currentBorrowerName
                      ? `Issued to ${cp.currentBorrowerName} (Due: ${cp.currentDueDate})`
                      : cp.conditionNotes || '—'}
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    {cp.status !== 'Issued' ? (
                      <select
                        aria-label={`Change status for ${cp.accessionNumber}`}
                        value={cp.status}
                        onChange={(e) => updateStatusMut.mutate({ copyId: cp.id, status: e.target.value })}
                        className="px-2 py-1 text-xs border border-slate-300 rounded bg-white"
                      >
                        <option value="Available">Available</option>
                        <option value="Reserved">Reserved</option>
                        <option value="Damaged">Damaged</option>
                        <option value="UnderMaintenance">UnderMaintenance</option>
                        <option value="Lost">Lost</option>
                      </select>
                    ) : (
                      <Link to="/admin/returns" className="text-xs font-semibold text-blue-800 hover:underline">
                        Return via Desk →
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
