import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Cog6ToothIcon,
  BuildingStorefrontIcon,
  PrinterIcon,
  BellIcon,
  UserGroupIcon,
  ShieldCheckIcon,
  CurrencyDollarIcon,
  DeviceTabletIcon,
  QrCodeIcon,
  XMarkIcon,
  CheckIcon,
  TagIcon,
  PencilIcon,
  TrashIcon,
  PlusIcon
} from '@heroicons/react/24/outline';
import api from '../services/api';
import { printReceipt, printLabel } from '../services/print';
import toast from 'react-hot-toast';

export default function Settings() {
  const [activeTab, setActiveTab] = useState('store');

  const tabs = [
    { id: 'store', label: 'Store Info', icon: BuildingStorefrontIcon },
    { id: 'categories', label: 'Categories', icon: TagIcon },
    { id: 'hardware', label: 'Hardware', icon: PrinterIcon },
    { id: 'tax', label: 'Tax & Payment', icon: CurrencyDollarIcon },
    { id: 'notifications', label: 'Notifications', icon: BellIcon },
    { id: 'users', label: 'Users', icon: UserGroupIcon },
    { id: 'security', label: 'Security', icon: ShieldCheckIcon }
  ];

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500">Configure your POS system</p>
      </div>

      <div className="flex gap-6">
        {/* Sidebar */}
        <div className="w-64 flex-shrink-0">
          <nav className="space-y-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${
                  activeTab === tab.id
                    ? 'bg-primary-50 text-primary-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <tab.icon className="w-5 h-5" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1">
          {activeTab === 'store' && <StoreSettings />}
          {activeTab === 'categories' && <CategorySettings />}
          {activeTab === 'hardware' && <HardwareSettings />}
          {activeTab === 'tax' && <TaxSettings />}
          {activeTab === 'notifications' && <NotificationSettings />}
          {activeTab === 'users' && <UserSettings />}
          {activeTab === 'security' && <SecuritySettings />}
        </div>
      </div>
    </div>
  );
}

// Category Settings Component
function CategorySettings() {
  const queryClient = useQueryClient();
  const [editingCategory, setEditingCategory] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    category_name: '',
    description: '',
    sort_order: 0
  });

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get('/products/categories').then(res => res.data)
  });

  const createMutation = useMutation({
    mutationFn: (data) => api.post('/products/categories', data),
    onSuccess: () => {
      queryClient.invalidateQueries(['categories']);
      toast.success('Category created successfully');
      setShowAddForm(false);
      setFormData({ category_name: '', description: '', sort_order: 0 });
    },
    onError: (error) => toast.error(error.response?.data?.message || 'Failed to create category')
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => api.put(`/products/categories/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['categories']);
      toast.success('Category updated successfully');
      setEditingCategory(null);
    },
    onError: (error) => toast.error(error.response?.data?.message || 'Failed to update category')
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/products/categories/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries(['categories']);
      toast.success('Category deleted successfully');
    },
    onError: (error) => toast.error(error.response?.data?.message || 'Failed to delete category')
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editingCategory) {
      updateMutation.mutate({ id: editingCategory.category_id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const startEdit = (category) => {
    setEditingCategory(category);
    setFormData({
      category_name: category.category_name,
      description: category.description || '',
      sort_order: category.sort_order || 0,
      is_active: category.is_active
    });
    setShowAddForm(true);
  };

  const cancelEdit = () => {
    setEditingCategory(null);
    setShowAddForm(false);
    setFormData({ category_name: '', description: '', sort_order: 0 });
  };

  if (isLoading) {
    return <div className="animate-pulse bg-gray-100 rounded-xl h-64" />;
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl p-6 border">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-lg font-semibold">Product Categories</h2>
            <p className="text-sm text-gray-500">Manage your product categories</p>
          </div>
          {!showAddForm && (
            <button
              onClick={() => setShowAddForm(true)}
              className="btn btn-primary flex items-center gap-2"
            >
              <PlusIcon className="w-5 h-5" />
              Add Category
            </button>
          )}
        </div>

        {/* Add/Edit Form */}
        {showAddForm && (
          <form onSubmit={handleSubmit} className="mb-6 p-4 bg-gray-50 rounded-lg">
            <h3 className="font-medium mb-4">
              {editingCategory ? 'Edit Category' : 'Add New Category'}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">Category Name *</label>
                <input
                  type="text"
                  value={formData.category_name}
                  onChange={(e) => setFormData({ ...formData, category_name: e.target.value })}
                  className="input"
                  placeholder="Enter category name"
                  required
                />
              </div>
              <div>
                <label className="label">Sort Order</label>
                <input
                  type="number"
                  value={formData.sort_order}
                  onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })}
                  className="input"
                  placeholder="0"
                />
              </div>
              <div className="md:col-span-2">
                <label className="label">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="input resize-none"
                  rows={2}
                  placeholder="Optional description"
                />
              </div>
              {editingCategory && (
                <div className="md:col-span-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.is_active}
                      onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                      className="w-4 h-4 text-primary-600 rounded"
                    />
                    <span className="text-sm text-gray-700">Active</span>
                  </label>
                </div>
              )}
            </div>
            <div className="flex gap-2 mt-4">
              <button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                className="btn btn-primary"
              >
                {(createMutation.isPending || updateMutation.isPending) ? 'Saving...' : 
                  editingCategory ? 'Update Category' : 'Create Category'}
              </button>
              <button
                type="button"
                onClick={cancelEdit}
                className="btn bg-gray-100 text-gray-700 hover:bg-gray-200"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Categories List */}
        <div className="space-y-2">
          {categories.length === 0 ? (
            <p className="text-center text-gray-500 py-8">No categories found. Add your first category above.</p>
          ) : (
            categories.map((category) => (
              <div
                key={category.category_id}
                className={`flex items-center justify-between p-4 rounded-lg border ${
                  category.is_active ? 'bg-white' : 'bg-gray-50 opacity-60'
                }`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-gray-900">{category.category_name}</h3>
                    {!category.is_active && (
                      <span className="px-2 py-0.5 text-xs bg-gray-200 text-gray-600 rounded">Inactive</span>
                    )}
                  </div>
                  {category.description && (
                    <p className="text-sm text-gray-500 mt-1">{category.description}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">Sort Order: {category.sort_order || 0}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => startEdit(category)}
                    className="p-2 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                    title="Edit"
                  >
                    <PencilIcon className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('Are you sure you want to delete this category?')) {
                        deleteMutation.mutate(category.category_id);
                      }
                    }}
                    className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete"
                  >
                    <TrashIcon className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// Store Settings Component
function StoreSettings() {
  const queryClient = useQueryClient();
  
  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings', 'store'],
    queryFn: () => api.get('/settings/store').then(res => res.data)
  });

  const [formData, setFormData] = useState(null);

  // Initialize form when settings load
  useState(() => {
    if (settings) {
      setFormData(settings);
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: (data) => api.put('/settings/store', data),
    onSuccess: () => {
      queryClient.invalidateQueries(['settings', 'store']);
      toast.success('Store settings saved');
    },
    onError: () => toast.error('Failed to save settings')
  });

  const currentData = formData || settings || {};

  return (
    <div className="bg-white rounded-xl p-6 border">
      <h2 className="text-lg font-semibold mb-6">Store Information</h2>
      
      <div className="space-y-4 max-w-xl">
        <div>
          <label className="label">Store Name</label>
          <input
            type="text"
            value={currentData.store_name || ''}
            onChange={(e) => setFormData({ ...currentData, store_name: e.target.value })}
            placeholder="HIT BY HUMA"
            className="input"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Phone</label>
            <input
              type="tel"
              value={currentData.phone || ''}
              onChange={(e) => setFormData({ ...currentData, phone: e.target.value })}
              placeholder="(555) 123-4567"
              className="input"
            />
          </div>
          <div>
            <label className="label">Email</label>
            <input
              type="email"
              value={currentData.email || ''}
              onChange={(e) => setFormData({ ...currentData, email: e.target.value })}
              placeholder="store@example.com"
              className="input"
            />
          </div>
        </div>

        <div>
          <label className="label">Address</label>
          <textarea
            value={currentData.address || ''}
            onChange={(e) => setFormData({ ...currentData, address: e.target.value })}
            placeholder="123 Main Street, City, State 12345"
            rows={2}
            className="input resize-none"
          />
        </div>

        <div>
          <label className="label">Receipt Footer Message</label>
          <textarea
            value={currentData.receipt_footer || ''}
            onChange={(e) => setFormData({ ...currentData, receipt_footer: e.target.value })}
            placeholder="Thank you for shopping with us!"
            rows={2}
            className="input resize-none"
          />
        </div>

        <div className="pt-4">
          <button
            onClick={() => saveMutation.mutate(formData)}
            disabled={saveMutation.isPending}
            className="btn-primary"
          >
            {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Hardware Settings Component — printing happens in the browser via the
// OS print dialog (installed printer drivers), so no server hardware routes exist.
function HardwareSettings() {
  const testReceipt = () => {
    try {
      printReceipt({
        saleNumber: 'TEST-0001',
        createdAt: new Date().toISOString(),
        cashierName: 'Test',
        items: [
          { name: 'Test Product', quantity: 1, unitPrice: 1000, lineTotal: 1000 },
          { name: 'Another Product', quantity: 2, unitPrice: 500, lineTotal: 1000 },
        ],
        subtotal: 2000,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 2000,
        payments: [{ methodName: 'Cash', amount: 2000 }],
      });
      toast.success('Test receipt sent to print dialog');
    } catch (error) {
      toast.error(error.message);
    }
  };

  const testLabel = () => {
    try {
      printLabel({ name: 'Test Product', sku: 'TEST-SKU-001', barcode: 'TEST0001', price: 1500 }, 1);
      toast.success('Test label sent to print dialog');
    } catch (error) {
      toast.error(error.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl p-6 border">
        <h2 className="text-lg font-semibold mb-2">Printing & Devices</h2>
        <p className="text-sm text-gray-500 mb-6">
          Receipts and labels are printed from your browser through the Windows print dialog.
          Select your Epson thermal printer for receipts (80mm) and the Medialink label printer for labels (50x30mm).
          Make sure popups are allowed for this site.
        </p>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center">
                <PrinterIcon className="w-6 h-6 text-gray-500" />
              </div>
              <div>
                <p className="font-medium text-gray-900">Thermal Receipt Printer</p>
                <p className="text-sm text-gray-500">Epson — 80mm paper, chosen in the print dialog</p>
              </div>
            </div>
            <button onClick={testReceipt} className="btn btn-sm btn-secondary">
              Print Test Receipt
            </button>
          </div>
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center">
                <QrCodeIcon className="w-6 h-6 text-gray-500" />
              </div>
              <div>
                <p className="font-medium text-gray-900">Label Printer</p>
                <p className="text-sm text-gray-500">Medialink — 50x30mm labels, chosen in the print dialog</p>
              </div>
            </div>
            <button onClick={testLabel} className="btn btn-sm btn-secondary">
              Print Test Label
            </button>
          </div>
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center">
                <DeviceTabletIcon className="w-6 h-6 text-gray-500" />
              </div>
              <div>
                <p className="font-medium text-gray-900">Barcode Scanner</p>
                <p className="text-sm text-gray-500">USB HID — works automatically on the POS screen</p>
              </div>
            </div>
            <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
              Ready
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Tax Settings Component
function TaxSettings() {
  const queryClient = useQueryClient();
  
  const { data: settings } = useQuery({
    queryKey: ['settings', 'tax'],
    queryFn: () => api.get('/settings/tax').then(res => res.data)
  });

  const [formData, setFormData] = useState(null);
  const currentData = formData || settings || {};

  const saveMutation = useMutation({
    mutationFn: (data) => api.put('/settings/tax', data),
    onSuccess: () => {
      queryClient.invalidateQueries(['settings', 'tax']);
      toast.success('Tax settings saved');
    }
  });

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl p-6 border">
        <h2 className="text-lg font-semibold mb-6">Tax Configuration</h2>
        
        <div className="space-y-4 max-w-md">
          <div>
            <label className="label">Default Tax Rate (%)</label>
            <input
              type="number"
              value={currentData.tax_rate || ''}
              onChange={(e) => setFormData({ ...currentData, tax_rate: e.target.value })}
              placeholder="8.25"
              step="0.01"
              className="input"
            />
          </div>

          <div>
            <label className="label">Tax ID / EIN</label>
            <input
              type="text"
              value={currentData.tax_id || ''}
              onChange={(e) => setFormData({ ...currentData, tax_id: e.target.value })}
              placeholder="XX-XXXXXXX"
              className="input"
            />
          </div>

          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium">Tax Inclusive Pricing</p>
              <p className="text-sm text-gray-500">Prices already include tax</p>
            </div>
            <Toggle />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 border">
        <h2 className="text-lg font-semibold mb-6">Payment Methods</h2>
        
        <div className="space-y-3">
          {['Cash', 'Credit Card', 'Debit Card', 'Store Credit', 'Split Payment'].map((method) => (
            <div key={method} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <span className="font-medium">{method}</span>
              <Toggle defaultChecked />
            </div>
          ))}
        </div>

        <div className="mt-6 pt-4">
          <button
            onClick={() => saveMutation.mutate(formData)}
            disabled={saveMutation.isPending}
            className="btn-primary"
          >
            {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Notification Settings Component
function NotificationSettings() {
  const queryClient = useQueryClient();
  const [lowStockThreshold, setLowStockThreshold] = useState(10);
  const [settings, setSettings] = useState({
    lowStockAlerts: true,
    dailySalesSummary: true,
    newCustomerSignup: false,
    smsReceipts: true
  });
  const [initialized, setInitialized] = useState(false);

  // Fetch settings
  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get('/settings').then(res => res.data),
  });

  // Update local state when data changes
  useEffect(() => {
    if (data && !initialized) {
      if (data?.low_stock_threshold?.value) {
        setLowStockThreshold(parseInt(data.low_stock_threshold.value) || 10);
      }
      if (data?.low_stock_alerts?.value) {
        setSettings(prev => ({ ...prev, lowStockAlerts: data.low_stock_alerts.value === 'true' }));
      }
      if (data?.daily_sales_summary?.value) {
        setSettings(prev => ({ ...prev, dailySalesSummary: data.daily_sales_summary.value === 'true' }));
      }
      if (data?.new_customer_signup?.value) {
        setSettings(prev => ({ ...prev, newCustomerSignup: data.new_customer_signup.value === 'true' }));
      }
      if (data?.sms_receipts?.value) {
        setSettings(prev => ({ ...prev, smsReceipts: data.sms_receipts.value === 'true' }));
      }
      setInitialized(true);
    }
  }, [data, initialized]);

  const saveMutation = useMutation({
    mutationFn: ({ key, value }) => api.put(`/settings/${key}`, { value }),
    onSuccess: () => {
      queryClient.invalidateQueries(['settings']);
      toast.success('Setting saved');
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to save setting');
    }
  });

  const handleThresholdChange = (e) => {
    setLowStockThreshold(e.target.value);
  };

  const saveThreshold = () => {
    saveMutation.mutate({ key: 'low_stock_threshold', value: lowStockThreshold });
  };

  const handleToggle = (key, settingKey) => {
    const newValue = !settings[key];
    setSettings(prev => ({ ...prev, [key]: newValue }));
    saveMutation.mutate({ key: settingKey, value: String(newValue) });
  };

  return (
    <div className="bg-white rounded-xl p-6 border">
      <h2 className="text-lg font-semibold mb-6">Notification Preferences</h2>
      
      <div className="space-y-4 max-w-xl">
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
          <div>
            <p className="font-medium">Low Stock Alerts</p>
            <p className="text-sm text-gray-500">Get notified when items are running low</p>
          </div>
          <Toggle checked={settings.lowStockAlerts} onChange={() => handleToggle('lowStockAlerts', 'low_stock_alerts')} />
        </div>

        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
          <div>
            <p className="font-medium">Daily Sales Summary</p>
            <p className="text-sm text-gray-500">Email end-of-day sales report</p>
          </div>
          <Toggle checked={settings.dailySalesSummary} onChange={() => handleToggle('dailySalesSummary', 'daily_sales_summary')} />
        </div>

        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
          <div>
            <p className="font-medium">New Customer Signup</p>
            <p className="text-sm text-gray-500">Alert when new customers register</p>
          </div>
          <Toggle checked={settings.newCustomerSignup} onChange={() => handleToggle('newCustomerSignup', 'new_customer_signup')} />
        </div>

        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
          <div>
            <p className="font-medium">Customer SMS Receipts</p>
            <p className="text-sm text-gray-500">Allow sending receipts via SMS</p>
          </div>
          <Toggle checked={settings.smsReceipts} onChange={() => handleToggle('smsReceipts', 'sms_receipts')} />
        </div>

        <div className="mt-4">
          <label className="label">Low Stock Threshold</label>
          <div className="flex gap-2">
            <input
              type="number"
              value={lowStockThreshold}
              onChange={handleThresholdChange}
              className="input max-w-[200px]"
            />
            <button 
              onClick={saveThreshold}
              disabled={saveMutation.isLoading}
              className="btn btn-primary"
            >
              {saveMutation.isLoading ? 'Saving...' : 'Save'}
            </button>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Alert when stock falls below this number
          </p>
        </div>
      </div>
    </div>
  );
}

// User Settings Component
function UserSettings() {
  const [showAddUser, setShowAddUser] = useState(false);

  const { data: users, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/settings/users').then(res => res.data)
  });

  return (
    <div className="bg-white rounded-xl p-6 border">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold">Users & Permissions</h2>
        <button onClick={() => setShowAddUser(true)} className="btn-primary btn-sm">
          Add User
        </button>
      </div>

      <div className="space-y-3">
        {isLoading ? (
          <div className="animate-pulse space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-gray-100 rounded-lg" />
            ))}
          </div>
        ) : users?.length > 0 ? (
          users.map((user) => (
            <div
              key={user.employee_id}
              className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                  <span className="text-sm font-bold text-primary-600">
                    {user.first_name?.[0]}{user.last_name?.[0]}
                  </span>
                </div>
                <div>
                  <p className="font-medium">{user.first_name} {user.last_name}</p>
                  <p className="text-sm text-gray-500">{user.employee_code}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                  user.role === 'admin' ? 'bg-purple-100 text-purple-700' :
                  user.role === 'manager' ? 'bg-blue-100 text-blue-700' :
                  'bg-gray-100 text-gray-700'
                }`}>
                  {user.role}
                </span>
                <span className={`px-2 py-1 text-xs rounded-full ${
                  user.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}>
                  {user.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-8 text-gray-500">
            <UserGroupIcon className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p>No users found</p>
          </div>
        )}
      </div>

      {/* Add User Modal */}
      {showAddUser && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl w-full max-w-md p-8 relative">
            <button
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
              onClick={() => setShowAddUser(false)}
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
            <h3 className="text-lg font-semibold mb-4">Add New User</h3>
            <AddUserForm onSuccess={() => setShowAddUser(false)} />
          </div>
        </div>
      )}
    </div>
  );
// Add User Form Component
function AddUserForm({ onSuccess }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    employee_code: '',
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    password: '',
    role_id: 3, // default to cashier
    location_id: 1
  });
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/settings/users', form);
      toast.success('User created successfully');
      queryClient.invalidateQueries(['users']);
      onSuccess();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create user');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="label">Employee Code *</label>
        <input
          name="employee_code"
          value={form.employee_code}
          onChange={handleChange}
          className="input"
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">First Name *</label>
          <input
            name="first_name"
            value={form.first_name}
            onChange={handleChange}
            className="input"
            required
          />
        </div>
        <div>
          <label className="label">Last Name</label>
          <input
            name="last_name"
            value={form.last_name}
            onChange={handleChange}
            className="input"
          />
        </div>
      </div>
      <div>
        <label className="label">Email</label>
        <input
          name="email"
          type="email"
          value={form.email}
          onChange={handleChange}
          className="input"
        />
      </div>
      <div>
        <label className="label">Phone</label>
        <input
          name="phone"
          value={form.phone}
          onChange={handleChange}
          className="input"
        />
      </div>
      <div>
        <label className="label">Password *</label>
        <input
          name="password"
          type="password"
          value={form.password}
          onChange={handleChange}
          className="input"
          required
        />
      </div>
      <div>
        <label className="label">Role</label>
        <select
          name="role_id"
          value={form.role_id}
          onChange={handleChange}
          className="input"
        >
          <option value={1}>Admin</option>
          <option value={2}>Manager</option>
          <option value={3}>Cashier</option>
        </select>
      </div>
      <div>
        <label className="label">Location</label>
        <input
          name="location_id"
          type="number"
          value={form.location_id}
          onChange={handleChange}
          className="input"
        />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn" onClick={onSuccess} disabled={loading}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Saving...' : 'Create User'}
        </button>
      </div>
    </form>
  );
}
}

// Security Settings Component
function SecuritySettings() {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl p-6 border">
        <h2 className="text-lg font-semibold mb-6">Security Settings</h2>
        
        <div className="space-y-4 max-w-xl">
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium">Require PIN for Voids</p>
              <p className="text-sm text-gray-500">Manager PIN needed to void transactions</p>
            </div>
            <Toggle defaultChecked />
          </div>

          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium">Require PIN for Discounts</p>
              <p className="text-sm text-gray-500">Manager PIN for discounts over threshold</p>
            </div>
            <Toggle defaultChecked />
          </div>

          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium">Auto-logout</p>
              <p className="text-sm text-gray-500">Sign out after inactivity</p>
            </div>
            <Toggle defaultChecked />
          </div>

          <div>
            <label className="label">Auto-logout Time (minutes)</label>
            <input
              type="number"
              placeholder="15"
              className="input max-w-[200px]"
            />
          </div>

          <div>
            <label className="label">Maximum Discount % Without Approval</label>
            <input
              type="number"
              placeholder="10"
              className="input max-w-[200px]"
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 border">
        <h2 className="text-lg font-semibold mb-4">Session Management</h2>
        <button className="btn bg-red-500 text-white hover:bg-red-600">
          Sign Out All Devices
        </button>
        <p className="text-sm text-gray-500 mt-2">
          This will sign out all users from all devices
        </p>
      </div>
    </div>
  );
}

// Toggle Component
function Toggle({ defaultChecked = false, checked: controlledChecked, onChange }) {
  const [internalChecked, setInternalChecked] = useState(defaultChecked);
  
  // Use controlled value if provided, otherwise use internal state
  const isControlled = controlledChecked !== undefined;
  const checked = isControlled ? controlledChecked : internalChecked;

  const handleToggle = () => {
    if (!isControlled) {
      setInternalChecked(!checked);
    }
    onChange?.(!checked);
  };

  return (
    <button
      onClick={handleToggle}
      className={`relative w-12 h-6 rounded-full transition-colors ${
        checked ? 'bg-primary-600' : 'bg-gray-300'
      }`}
    >
      <span
        className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
          checked ? 'left-7' : 'left-1'
        }`}
      />
    </button>
  );
}
