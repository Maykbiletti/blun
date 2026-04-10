const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const axios = require('axios');

const getInvoices = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { limit = 10, starting_after } = req.query;

    if (!customerId) {
      return res.status(400).json({ error: 'Missing customer ID' });
    }

    const params = {
      customer: customerId,
      limit: parseInt(limit)
    };

    if (starting_after) {
      params.starting_after = starting_after;
    }

    const invoices = await stripe.invoices.list(params);

    const formattedInvoices = invoices.data.map(invoice => ({
      id: invoice.id,
      number: invoice.number,
      status: invoice.status,
      amount_paid: invoice.amount_paid,
      amount_due: invoice.amount_due,
      currency: invoice.currency,
      created: invoice.created,
      due_date: invoice.due_date,
      hosted_invoice_url: invoice.hosted_invoice_url,
      invoice_pdf: invoice.invoice_pdf,
      payment_intent: invoice.payment_intent,
      subscription: invoice.subscription
    }));

    res.json({
      invoices: formattedInvoices,
      has_more: invoices.has_more
    });
  } catch (error) {
    console.error('Get invoices error:', error);
    res.status(500).json({ error: 'Failed to get invoices' });
  }
};

const getInvoice = async (req, res) => {
  try {
    const { invoiceId } = req.params;

    if (!invoiceId) {
      return res.status(400).json({ error: 'Missing invoice ID' });
    }

    const invoice = await stripe.invoices.retrieve(invoiceId);

    res.json({
      invoice: {
        id: invoice.id,
        number: invoice.number,
        status: invoice.status,
        amount_paid: invoice.amount_paid,
        amount_due: invoice.amount_due,
        currency: invoice.currency,
        created: invoice.created,
        due_date: invoice.due_date,
        hosted_invoice_url: invoice.hosted_invoice_url,
        invoice_pdf: invoice.invoice_pdf,
        payment_intent: invoice.payment_intent,
        subscription: invoice.subscription,
        lines: invoice.lines.data.map(line => ({
          id: line.id,
          description: line.description,
          amount: line.amount,
          currency: line.currency,
          period: line.period
        }))
      }
    });
  } catch (error) {
    console.error('Get invoice error:', error);
    res.status(500).json({ error: 'Failed to get invoice' });
  }
};

const downloadInvoicePDF = async (req, res) => {
  try {
    const { invoiceId } = req.params;

    if (!invoiceId) {
      return res.status(400).json({ error: 'Missing invoice ID' });
    }

    const invoice = await stripe.invoices.retrieve(invoiceId);

    if (!invoice.invoice_pdf) {
      return res.status(404).json({ error: 'Invoice PDF not available' });
    }

    // Download PDF from Stripe
    const response = await axios({
      method: 'GET',
      url: invoice.invoice_pdf,
      responseType: 'stream'
    });

    // Set appropriate headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${invoice.number || invoiceId}.pdf"`);

    // Pipe the PDF stream to the response
    response.data.pipe(res);
  } catch (error) {
    console.error('Download invoice PDF error:', error);
    if (error.response && error.response.status === 404) {
      res.status(404).json({ error: 'Invoice PDF not found' });
    } else {
      res.status(500).json({ error: 'Failed to download invoice PDF' });
    }
  }
};

const sendInvoiceEmail = async (req, res) => {
  try {
    const { invoiceId } = req.params;

    if (!invoiceId) {
      return res.status(400).json({ error: 'Missing invoice ID' });
    }

    const sentInvoice = await stripe.invoices.sendInvoice(invoiceId);

    res.json({
      invoice: {
        id: sentInvoice.id,
        status: sentInvoice.status,
        sent_at: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Send invoice email error:', error);
    res.status(500).json({ error: 'Failed to send invoice email' });
  }
};

module.exports = {
  getInvoices,
  getInvoice,
  downloadInvoicePDF,
  sendInvoiceEmail
};