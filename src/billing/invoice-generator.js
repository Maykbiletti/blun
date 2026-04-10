function generateInvoice(customerId, items, total) {
    if (!customerId || !items || !Array.isArray(items) || total === undefined) {
        throw new Error('Invalid parameters: customerId, items array, and total are required');
    }

    const invoiceNumber = `INV-${Date.now()}-${customerId}`;
    const subtotal = parseFloat(total) || 0;
    const taxRate = 0.19; // 19% VAT
    const tax = subtotal * taxRate;
    const totalWithTax = subtotal + tax;

    // Due date: 30 days from now
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);

    return {
        invoice_number: invoiceNumber,
        items: items.map(item => ({
            description: item.description || '',
            quantity: item.quantity || 1,
            unit_price: item.unit_price || 0,
            total: (item.quantity || 1) * (item.unit_price || 0)
        })),
        subtotal: subtotal.toFixed(2),
        tax: tax.toFixed(2),
        total: totalWithTax.toFixed(2),
        due_date: dueDate.toISOString().split('T')[0]
    };
}

module.exports = { generateInvoice };