import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  MagnifyingGlassIcon,
  PlusIcon,
  MinusIcon,
  TrashIcon,
  UserIcon,
  ReceiptPercentIcon,
  PauseIcon,
  ArrowPathIcon,
  CreditCardIcon,
  BanknotesIcon,
  XMarkIcon,
  QrCodeIcon,
  PrinterIcon
} from '@heroicons/react/24/outline';
import { useCartStore } from '../stores/cartStore';
import api from '../services/api';
import { printReceipt } from '../services/print';
import toast from 'react-hot-toast';

export default function POS() {
  const [searchQuery, setSearchQuery] = useState('');
  const [showPayment, setShowPayment] = useState(false);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [showSuspendedModal, setShowSuspendedModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const searchInputRef = useRef(null);
  const lastScanRef = useRef('');
  const scanTimeoutRef = useRef(null);

  const {
    items,
    customer,
    discountAmount: discount,
    addItem,
    updateQuantity,
    removeItem,
    setCustomer,
    setDiscount,
    clearCart,
    getSubtotal,
    getTax,
    getTotal,
    suspendCart,
    resumeCart,
    getSuspendedCarts
  } = useCartStore();

  // Fetch categories
  const { data: categoriesData } = useQuery({
    queryKey: ['pos-categories'],
    queryFn: () => api.get('/products/categories/list').then(res => res.data)
  });

  // Transform categories to consistent format
  const categories = categoriesData?.categories?.map(cat => ({
    id: cat.CategoryID,
    name: cat.CategoryName
  })) || [];

  // Fetch payment methods
  const { data: paymentMethodsData, isLoading: paymentMethodsLoading } = useQuery({
    queryKey: ['payment-methods'],
    queryFn: () => api.get('/sales/payment-methods/list').then(res => res.data)
  });

  // Transform payment methods - handle both array and object with paymentMethods property
  const paymentMethods = Array.isArray(paymentMethodsData)
    ? paymentMethodsData
    : (paymentMethodsData?.paymentMethods || []);

  const getPaymentMethodId = (type) => {
    // Find by method_type (snake_case from database)
    let method = paymentMethods.find(m => m.method_type === type || m.MethodType === type);
    // If not found, try by method_name (case-insensitive)
    if (!method) {
      method = paymentMethods.find(m =>
        m.method_name?.toLowerCase().includes(type.toLowerCase()) ||
        m.MethodName?.toLowerCase().includes(type.toLowerCase())
      );
    }
    // Return the ID or the first available method as fallback
    if (method) return method.payment_method_id || method.PaymentMethodID;
    // Ultimate fallback - return first method's ID if available
    if (paymentMethods.length > 0) return paymentMethods[0].payment_method_id || paymentMethods[0].PaymentMethodID;
    return null;
  };

  // Fetch products - use quick search for POS
  const {
    data: searchResults,
    isLoading: productsLoading,
    refetch: refetchProducts
  } = useQuery({
    queryKey: ['pos-products', selectedCategory, searchQuery],
    queryFn: async () => {
      // If there's a search query, use quick search
      if (searchQuery && searchQuery.length >= 2) {
        const response = await api.get(`/products/search/quick?q=${encodeURIComponent(searchQuery)}`);
        return response.data;
      }
      // Otherwise get all products
      const params = new URLSearchParams();
      if (selectedCategory) params.append('categoryId', selectedCategory);
      const response = await api.get(`/products?${params}`);
      return response.data;
    },
    enabled: true,
    staleTime: 30 * 1000, // 30 seconds - refresh product list more frequently
    refetchOnWindowFocus: true // Refresh when switching back to POS tab
  });

  // Normalize products data - handle both quick search results and regular products
  const products = searchResults?.results || searchResults?.products || [];

  // Process sale mutation
  const processSaleMutation = useMutation({
    mutationFn: (saleData) => api.post('/sales', saleData),
    onSuccess: (response) => {
      toast.success('Sale completed successfully!');
      clearCart();
      setShowPayment(false);
      refetchProducts(); // <-- Refetch products to update stock
      // Fetch the completed sale and print the receipt via the browser print dialog
      const saleId = response.data.saleId || response.data.transaction_id;
      if (saleId) {
        api.get(`/sales/${saleId}`).then(({ data }) => {
          printReceipt({
            saleNumber: data.sale?.sale_number,
            createdAt: data.sale?.created_at,
            cashierName: [data.sale?.cashier_first_name, data.sale?.cashier_last_name].filter(Boolean).join(' '),
            locationName: data.sale?.location_name,
            locationAddress: data.sale?.location_address,
            locationPhone: data.sale?.location_phone,
            customerName: [data.sale?.customer_first_name, data.sale?.customer_last_name].filter(Boolean).join(' '),
            items: (data.items || []).map(i => ({
              name: i.variant_name && i.variant_name !== 'Default'
                ? `${i.product_name} (${i.variant_name})`
                : i.product_name,
              quantity: i.quantity,
              unitPrice: i.unit_price,
              lineTotal: i.line_total,
            })),
            subtotal: data.sale?.subtotal,
            discountAmount: data.sale?.discount_amount,
            taxAmount: data.sale?.tax_amount,
            totalAmount: data.sale?.total_amount,
            payments: data.payments || [],
          });
        }).catch(() => { }); // Ignore print errors
      }
    },
    onError: (error) => {
      console.error('Sale error:', error.response?.data || error);
      toast.error(error.response?.data?.message || 'Failed to process sale');
    }
  });

  // Barcode scanner handler
  useEffect(() => {
    const handleKeyPress = (e) => {
      // Ignore if focused on an input
      if (document.activeElement.tagName === 'INPUT' &&
        document.activeElement !== searchInputRef.current) {
        return;
      }

      // Clear previous timeout
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
      }

      // Build barcode string
      if (e.key.length === 1) {
        lastScanRef.current += e.key;
      }

      // Set timeout to process barcode
      scanTimeoutRef.current = setTimeout(() => {
        const barcode = lastScanRef.current.trim();
        if (barcode.length >= 6) {
          handleBarcodeScanned(barcode);
        }
        lastScanRef.current = '';
      }, 100);
    };

    window.addEventListener('keypress', handleKeyPress);
    return () => {
      window.removeEventListener('keypress', handleKeyPress);
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
      }
    };
  }, []);

  const handleBarcodeScanned = async (barcode) => {
    try {
      const response = await api.get(`/products/barcode/${barcode}`);
      if (response.data) {
        const product = response.data;
        const stock = parseInt(product.stock) || 0;

        // Check if product is in stock
        if (stock <= 0) {
          toast.error(`${product.productName} is out of stock`);
          return;
        }

        // Check if adding more would exceed stock
        const existingItem = items.find(item => item.variantId === product.variantId);
        const currentQty = existingItem?.quantity || 0;
        if (currentQty >= stock) {
          toast.error(`Only ${stock} available in stock`);
          return;
        }

        addItem({
          variantId: product.variantId,
          productId: product.productId,
          productName: product.productName,
          variantName: product.variantName || 'Default',
          sku: product.sku,
          barcode: product.barcode,
          price: product.price,
          imageUrl: product.imageUrl,
          stock: stock
        });
        const displayName = product.variantName && product.variantName !== 'Default'
          ? `${product.productName} - ${product.variantName}`
          : product.productName;
        toast.success(`Scanned: ${displayName}`);
      }
    } catch (error) {
      toast.error(`Product not found: ${barcode}`);
    }
  };

  const handleProductClick = (product) => {
    // Normalize product data from either quick search or regular products endpoint
    // Quick search returns: variant_id, sku, barcode, variant_name, price, product_name, product_code, product_id, stock
    // Regular products returns: id, code, name, basePrice, variantId, sku, barcode, totalStock
    const stock = parseInt(product.stock) || parseInt(product.totalStock) || 0;

    const normalizedItem = {
      variantId: product.variantId || product.variant_id || (product.variants?.[0]?.id),
      productId: product.productId || product.product_id || product.id,
      productName: product.productName || product.product_name || product.name,
      variantName: product.variantName || product.variant_name || product.variants?.[0]?.name || 'Default',
      sku: product.sku || product.code || product.product_code,
      barcode: product.barcode,
      price: parseFloat(product.price) || parseFloat(product.basePrice) || 0,
      imageUrl: product.imageUrl || product.image_url || product.imageURL,
      stock: stock
    };

    if (!normalizedItem.variantId) {
      toast.error('Product variant not found. Please try again.');
      console.error('Missing variantId for product:', product);
      return;
    }

    // Check if product is in stock
    if (stock <= 0) {
      toast.error(`${normalizedItem.productName} is out of stock`);
      return;
    }

    // Check if adding more would exceed stock
    const existingItem = items.find(item => item.variantId === normalizedItem.variantId);
    const currentQty = existingItem?.quantity || 0;
    if (currentQty >= stock) {
      toast.error(`Only ${stock} available in stock`);
      return;
    }

    addItem(normalizedItem);
    const displayName = normalizedItem.variantName && normalizedItem.variantName !== 'Default'
      ? `${normalizedItem.productName} - ${normalizedItem.variantName}`
      : normalizedItem.productName;
    toast.success(`Added: ${displayName}`);
  };

  const handleCheckout = () => {
    if (items.length === 0) {
      toast.error('Cart is empty');
      return;
    }
    if (paymentMethodsLoading || paymentMethods.length === 0) {
      toast.error('Payment methods loading, please wait...');
      return;
    }
    setShowPayment(true);
  };

  const handlePayment = (paymentMethodId, paymentMethodType) => {
    if (!paymentMethodId) {
      toast.error('Invalid payment method. Please try again.');
      return;
    }

    const totalAmount = getTotal();

    const saleData = {
      locationId: 1, // TODO: Get from user's current location/settings
      customerId: customer?.id || customer?.customer_id || null,
      items: items.map(item => ({
        variantId: item.variantId,
        quantity: item.quantity,
        unitPrice: item.price,
        originalPrice: item.originalPrice || item.price,
        discountAmount: item.discountAmount || 0,
        taxAmount: 0
      })),
      payments: [{
        paymentMethodId: paymentMethodId,
        amount: totalAmount
      }],
      discountAmount: discount || 0,
      notes: null
    };

    processSaleMutation.mutate(saleData);
  };

  const suspendedCarts = getSuspendedCarts();

  return (
    <div className="h-[calc(100vh-4rem)] flex">
      {/* Left Panel - Products */}
      <div className="flex-1 flex flex-col bg-gray-50">
        {/* Search & Categories */}
        <div className="p-4 bg-white border-b space-y-4">
          {/* Search Bar */}
          <div className="relative flex gap-2">
            <div className="relative flex-1">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search products or scan barcode..."
                className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                >
                  <XMarkIcon className="w-5 h-5 text-gray-400" />
                </button>
              )}
            </div>
            <button
              onClick={() => refetchProducts()}
              className="p-3 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              title="Refresh Products"
            >
              <ArrowPathIcon className="w-5 h-5 text-gray-600" />
            </button>
          </div>

          {/* Categories */}
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`px-4 py-2 rounded-full whitespace-nowrap text-sm font-medium transition-colors ${!selectedCategory
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
            >
              All Products
            </button>
            {categories?.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-4 py-2 rounded-full whitespace-nowrap text-sm font-medium transition-colors ${selectedCategory === cat.id
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Product Grid */}
        <div className="flex-1 p-4 overflow-y-auto">
          {productsLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="bg-white rounded-xl p-4 animate-pulse">
                  <div className="w-full h-32 bg-gray-200 rounded-lg mb-3" />
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
                  <div className="h-4 bg-gray-200 rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : products?.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {products.map((product, index) => {
                // Handle both quick search results and regular products
                const id = product.variantId || product.id || index;
                const name = product.productName || product.name;
                const variantName = product.variantName;
                const displayName = variantName && variantName !== 'Default'
                  ? `${name} - ${variantName}`
                  : name;
                const sku = product.sku || product.code;
                const price = product.price || product.basePrice || 0;
                const imageUrl = product.imageUrl || product.imageURL;
                const stock = product.stock ?? product.totalStock ?? 0;

                return (
                  <button
                    key={id}
                    onClick={() => stock > 0 && handleProductClick(product)}
                    disabled={stock <= 0}
                    className={`bg-white rounded-xl p-4 text-left transition-shadow border border-gray-100 group ${stock <= 0
                      ? 'opacity-60 cursor-not-allowed'
                      : 'hover:shadow-lg'
                      }`}
                  >
                    <div className={`w-full h-32 bg-gray-100 rounded-lg mb-3 flex items-center justify-center overflow-hidden relative ${stock <= 0 ? 'grayscale' : ''
                      }`}>
                      {stock <= 0 && (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-10">
                          <span className="text-white font-bold text-sm bg-red-600 px-3 py-1 rounded-full">
                            OUT OF STOCK
                          </span>
                        </div>
                      )}
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={displayName}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                      ) : (
                        <QrCodeIcon className="w-12 h-12 text-gray-300" />
                      )}
                    </div>
                    <h3 className="font-medium text-gray-900 truncate">{displayName}</h3>
                    <p className="text-sm text-gray-500">{sku}</p>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-lg font-bold text-primary-600">
                        ${parseFloat(price).toFixed(2)}
                      </span>
                      <span className={`text-xs px-2 py-1 rounded-full ${stock > 10
                        ? 'bg-green-100 text-green-700'
                        : stock > 0
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-red-100 text-red-700'
                        }`}>
                        {stock > 0 ? `${stock} left` : 'Out of stock'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <QrCodeIcon className="w-16 h-16 mb-4" />
              <p className="text-lg">No products found</p>
              <p className="text-sm">Try a different search or category</p>
            </div>
          )}
        </div>
      </div>

      {/* Right Panel - Cart */}
      <div className="w-96 bg-white border-l flex flex-col">
        {/* Cart Header */}
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Current Sale</h2>
            <div className="flex gap-2">
              {/* Suspended Carts */}
              {suspendedCarts.length > 0 && (
                <button
                  onClick={() => setShowSuspendedModal(true)}
                  className="relative p-2 text-gray-500 hover:text-primary-600 hover:bg-gray-100 rounded-lg"
                  title="Suspended Carts"
                >
                  <PauseIcon className="w-5 h-5" />
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                    {suspendedCarts.length}
                  </span>
                </button>
              )}
              {/* Suspend Current */}
              {items.length > 0 && (
                <button
                  onClick={() => {
                    suspendCart();
                    toast.success('Cart suspended');
                  }}
                  className="p-2 text-gray-500 hover:text-primary-600 hover:bg-gray-100 rounded-lg"
                  title="Suspend Cart"
                >
                  <PauseIcon className="w-5 h-5" />
                </button>
              )}
              {/* Clear Cart */}
              {items.length > 0 && (
                <button
                  onClick={() => {
                    if (confirm('Clear all items from cart?')) {
                      clearCart();
                      toast.success('Cart cleared');
                    }
                  }}
                  className="p-2 text-gray-500 hover:text-red-600 hover:bg-gray-100 rounded-lg"
                  title="Clear Cart"
                >
                  <TrashIcon className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>

          {/* Customer Selection */}
          <button
            onClick={() => setShowCustomerModal(true)}
            className="w-full flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
              <UserIcon className="w-5 h-5 text-primary-600" />
            </div>
            {customer ? (
              <div className="text-left">
                <p className="font-medium text-gray-900">{customer.name}</p>
                <p className="text-sm text-gray-500">{customer.phone}</p>
              </div>
            ) : (
              <span className="text-gray-500">Add Customer (Optional)</span>
            )}
          </button>
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <ReceiptPercentIcon className="w-16 h-16 mb-4" />
              <p className="text-lg">Cart is empty</p>
              <p className="text-sm">Scan or select products to add</p>
            </div>
          ) : (
            items.map((item) => {
              // Display product name, with variant suffix if not "Default"
              const displayName = item.name && item.name !== 'Default'
                ? item.name
                : (item.productName || item.name || 'Unknown Product');
              const variantLabel = item.name && item.name !== 'Default' && item.name !== item.productName
                ? item.name.replace(item.productName + ' - ', '')
                : null;

              return (
                <div
                  key={item.variantId || `${item.productId}-${item.sku}`}
                  className="bg-gray-50 rounded-lg p-3"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 bg-gray-200 rounded-lg flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-gray-900 truncate">{displayName}</h4>
                      {variantLabel && (
                        <p className="text-xs text-gray-500">{variantLabel}</p>
                      )}
                      <p className="text-sm text-primary-600 font-medium">
                        ${parseFloat(item.price).toFixed(2)}
                      </p>
                    </div>
                    <button
                      onClick={() => removeItem(item.variantId)}
                      className="p-1 text-gray-400 hover:text-red-500"
                    >
                      <XMarkIcon className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateQuantity(item.variantId, item.quantity - 1)}
                        className="w-8 h-8 flex items-center justify-center bg-white border rounded-lg hover:bg-gray-100"
                      >
                        <MinusIcon className="w-4 h-4" />
                      </button>
                      <span className="w-8 text-center font-medium">{item.quantity}</span>
                      <button
                        onClick={() => {
                          const canIncrease = updateQuantity(item.variantId, item.quantity + 1);
                          if (!canIncrease) {
                            toast.error(`Only ${item.stock} available in stock`);
                          }
                        }}
                        disabled={item.stock !== undefined && item.stock !== null && item.quantity >= item.stock}
                        className={`w-8 h-8 flex items-center justify-center bg-white border rounded-lg ${item.stock !== undefined && item.stock !== null && item.quantity >= item.stock
                            ? 'opacity-50 cursor-not-allowed'
                            : 'hover:bg-gray-100'
                          }`}
                      >
                        <PlusIcon className="w-4 h-4" />
                      </button>
                    </div>
                    <span className="font-semibold text-gray-900">
                      ${(item.quantity * parseFloat(item.price)).toFixed(2)}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Cart Summary */}
        <div className="border-t p-4 space-y-3">
          {/* Discount Button */}
          <button
            onClick={() => setShowDiscountModal(true)}
            className="w-full flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <div className="flex items-center gap-2">
              <ReceiptPercentIcon className="w-5 h-5 text-gray-500" />
              <span className="text-gray-600">Discount</span>
            </div>
            <span className="font-medium text-gray-900">
              {discount > 0 ? `-$${discount.toFixed(2)}` : 'Add'}
            </span>
          </button>

          {/* Totals */}
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal</span>
              <span>${getSubtotal().toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Tax (8.25%)</span>
              <span>${getTax().toFixed(2)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Discount</span>
                <span>-${discount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold pt-2 border-t">
              <span>Total</span>
              <span>${getTotal().toFixed(2)}</span>
            </div>
          </div>

          {/* Checkout Button */}
          <button
            onClick={handleCheckout}
            disabled={items.length === 0 || processSaleMutation.isPending}
            className="w-full btn-primary btn-lg"
          >
            {processSaleMutation.isPending ? 'Processing...' : 'Checkout'}
          </button>
        </div>
      </div>

      {/* Payment Modal */}
      {showPayment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold">Payment</h3>
              <button onClick={() => setShowPayment(false)}>
                <XMarkIcon className="w-6 h-6 text-gray-400" />
              </button>
            </div>

            <div className="text-center mb-6">
              <p className="text-gray-500">Total Amount</p>
              <p className="text-4xl font-bold text-gray-900">${getTotal().toFixed(2)}</p>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => handlePayment(getPaymentMethodId('CASH'), 'CASH')}
                disabled={processSaleMutation.isPending}
                className="w-full flex items-center justify-center gap-3 p-4 bg-green-500 text-white rounded-xl hover:bg-green-600 transition-colors"
              >
                <BanknotesIcon className="w-6 h-6" />
                <span className="text-lg font-medium">Cash</span>
              </button>
              <button
                onClick={() => handlePayment(getPaymentMethodId('CARD'), 'CARD')}
                disabled={processSaleMutation.isPending}
                className="w-full flex items-center justify-center gap-3 p-4 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-colors"
              >
                <CreditCardIcon className="w-6 h-6" />
                <span className="text-lg font-medium">Credit/Debit Card</span>
              </button>
              <button
                onClick={() => handlePayment(getPaymentMethodId('CASH'), 'SPLIT')}
                disabled={processSaleMutation.isPending}
                className="w-full flex items-center justify-center gap-3 p-4 bg-purple-500 text-white rounded-xl hover:bg-purple-600 transition-colors"
              >
                <ArrowPathIcon className="w-6 h-6" />
                <span className="text-lg font-medium">Split Payment</span>
              </button>
            </div>

            {customer?.wallet_balance > 0 && (
              <div className="mt-4 p-3 bg-yellow-50 rounded-lg">
                <p className="text-sm text-yellow-800">
                  Customer has <strong>${customer.wallet_balance.toFixed(2)}</strong> store credit available
                </p>
                <button
                  onClick={() => handlePayment(getPaymentMethodId('STORE_CREDIT'), 'STORE_CREDIT')}
                  className="mt-2 w-full btn btn-sm bg-yellow-500 text-white hover:bg-yellow-600"
                >
                  Use Store Credit
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Customer Modal */}
      {showCustomerModal && (
        <CustomerModal
          onClose={() => setShowCustomerModal(false)}
          onSelect={(customer) => {
            setCustomer(customer);
            setShowCustomerModal(false);
          }}
        />
      )}

      {/* Discount Modal */}
      {showDiscountModal && (
        <DiscountModal
          currentDiscount={discount}
          subtotal={getSubtotal()}
          onClose={() => setShowDiscountModal(false)}
          onApply={(amount) => {
            setDiscount(amount);
            setShowDiscountModal(false);
          }}
        />
      )}

      {/* Suspended Carts Modal */}
      {showSuspendedModal && (
        <SuspendedCartsModal
          carts={suspendedCarts}
          onClose={() => setShowSuspendedModal(false)}
          onResume={(cartId) => {
            resumeCart(cartId);
            setShowSuspendedModal(false);
          }}
        />
      )}
    </div>
  );
}

// Customer Modal Component
function CustomerModal({ onClose, onSelect }) {
  const [search, setSearch] = useState('');
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);

  const searchCustomers = async (query) => {
    if (!query || query.length < 2) {
      setCustomers([]);
      return;
    }
    setLoading(true);
    try {
      const response = await api.get(`/customers?search=${query}`);
      setCustomers(response.data);
    } catch (error) {
      toast.error('Failed to search customers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => searchCustomers(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold">Select Customer</h3>
          <button onClick={onClose}>
            <XMarkIcon className="w-6 h-6 text-gray-400" />
          </button>
        </div>

        <div className="relative mb-4">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or phone..."
            className="w-full pl-10 pr-4 py-3 border rounded-lg"
            autoFocus
          />
        </div>

        <div className="flex-1 overflow-y-auto space-y-2">
          {loading ? (
            <div className="text-center py-8 text-gray-500">Searching...</div>
          ) : customers.length > 0 ? (
            customers.map((customer) => (
              <button
                key={customer.customer_id}
                onClick={() => onSelect(customer)}
                className="w-full flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 text-left"
              >
                <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                  <UserIcon className="w-5 h-5 text-primary-600" />
                </div>
                <div>
                  <p className="font-medium">{customer.first_name} {customer.last_name}</p>
                  <p className="text-sm text-gray-500">{customer.phone}</p>
                </div>
                {customer.wallet_balance > 0 && (
                  <span className="ml-auto text-sm text-green-600 font-medium">
                    ${customer.wallet_balance.toFixed(2)} credit
                  </span>
                )}
              </button>
            ))
          ) : search.length >= 2 ? (
            <div className="text-center py-8 text-gray-500">No customers found</div>
          ) : (
            <div className="text-center py-8 text-gray-500">Enter at least 2 characters to search</div>
          )}
        </div>

        <button onClick={onClose} className="mt-4 btn btn-secondary w-full">
          Continue without customer
        </button>
      </div>
    </div>
  );
}

// Discount Modal Component
function DiscountModal({ currentDiscount, subtotal, onClose, onApply }) {
  const [discountType, setDiscountType] = useState('percent');
  const [discountValue, setDiscountValue] = useState(currentDiscount > 0 ? currentDiscount.toString() : '');

  const calculateDiscount = () => {
    const value = parseFloat(discountValue) || 0;
    if (discountType === 'percent') {
      return Math.min((subtotal * value) / 100, subtotal);
    }
    return Math.min(value, subtotal);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold">Apply Discount</h3>
          <button onClick={onClose}>
            <XMarkIcon className="w-6 h-6 text-gray-400" />
          </button>
        </div>

        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setDiscountType('percent')}
            className={`flex-1 py-2 rounded-lg font-medium ${discountType === 'percent'
              ? 'bg-primary-600 text-white'
              : 'bg-gray-100 text-gray-700'
              }`}
          >
            Percentage %
          </button>
          <button
            onClick={() => setDiscountType('fixed')}
            className={`flex-1 py-2 rounded-lg font-medium ${discountType === 'fixed'
              ? 'bg-primary-600 text-white'
              : 'bg-gray-100 text-gray-700'
              }`}
          >
            Fixed Amount $
          </button>
        </div>

        <div className="relative mb-4">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
            {discountType === 'percent' ? '%' : '$'}
          </span>
          <input
            type="number"
            value={discountValue}
            onChange={(e) => setDiscountValue(e.target.value)}
            placeholder="Enter discount"
            className="w-full pl-10 pr-4 py-3 border rounded-lg text-xl font-medium"
            min="0"
            max={discountType === 'percent' ? 100 : subtotal}
          />
        </div>

        <div className="text-center mb-4 p-3 bg-gray-50 rounded-lg">
          <p className="text-gray-500">Discount Amount</p>
          <p className="text-2xl font-bold text-green-600">
            -${calculateDiscount().toFixed(2)}
          </p>
        </div>

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 btn btn-secondary">
            Cancel
          </button>
          <button
            onClick={() => onApply(calculateDiscount())}
            className="flex-1 btn-primary"
          >
            Apply Discount
          </button>
        </div>
      </div>
    </div>
  );
}

// Suspended Carts Modal
function SuspendedCartsModal({ carts, onClose, onResume }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold">Suspended Carts</h3>
          <button onClick={onClose}>
            <XMarkIcon className="w-6 h-6 text-gray-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2">
          {carts.map((cart) => (
            <button
              key={cart.id}
              onClick={() => onResume(cart.id)}
              className="w-full p-4 bg-gray-50 rounded-lg hover:bg-gray-100 text-left"
            >
              <div className="flex justify-between mb-2">
                <span className="font-medium">Cart #{cart.id.slice(-4)}</span>
                <span className="text-sm text-gray-500">
                  {new Date(cart.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{cart.items.length} items</span>
                <span className="font-medium">${cart.total.toFixed(2)}</span>
              </div>
              {cart.customer && (
                <p className="text-sm text-primary-600 mt-1">{cart.customer.name}</p>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
