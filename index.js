import fs from "fs";
import csv from "csv-parser";
import chalk from "chalk";
import ObjectsToCsv from "objects-to-csv";

const log = console.log;

const CUSTOMERS_FILE = "./input/customers.csv";
const INVOICES_FILE = "./input/invoices.csv";
const TRANSACTIONS_FILE = "./input/transactions.csv";

const stringToNumber = (string) => {
  return Number(string.replace(",", "."));
};

const readCSV = (filePath) => {
  return new Promise((resolve) => {
    let rows = [];

    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (data) => {
        rows.push(data);
      })

      .on("end", () => {
        resolve(rows);
      });
  });
};

const run = async () => {
  log(chalk.blue("Hello Marcel! Reading files..."));

  const customers = await readCSV(CUSTOMERS_FILE);
  const invoices = await readCSV(INVOICES_FILE);
  const transactions = await readCSV(TRANSACTIONS_FILE);

  log("Mapping Invoices...");

  return invoices
    .filter((invoice) => !!invoice.Number)
    .map((invoice) => {
      const transaction = transactions.find(
        (transaction) => transaction.invoice_id === invoice.id
      );
      const customer = customers.find(
        (customer) => customer.id === invoice.Customer
      );

      const shouldHaveTransaction =
        invoice.Status === "paid" && invoice["Amount Due"] !== "0,00";

      if (shouldHaveTransaction && !transaction) {
        log(
          chalk.red(
            `Transaction not found for invoice ${invoice.Number}, 
          price: ${invoice["Amount Due"]}, 
          Amount Due: ${invoice["Amount Due"]}, 
          Amount Paid: ${invoice["Amount Paid"]}`
          )
        );

        throw new Error("Transaction not found for invoice");
      }

      if (!customer) {
        log(chalk.red(`Custmer not found for invoice ${invoice.id}`));

        throw new Error("Customer not found for invoice");
      }

      const country = invoice["Customer Address Country"];
      const taxAmount = stringToNumber(invoice["Tax"]);
      const total = stringToNumber(invoice["Total"]);
      const gross = transaction ? stringToNumber(transaction.gross) : total;
      const taxPercent =
        taxAmount && total ? taxAmount / (total - taxAmount) : 0;
      const unitPrice = gross / (1 + taxPercent);

      const taxPercentEs = taxPercent.toLocaleString("es-ES");
      const unitPriceEs = unitPrice.toLocaleString("es-ES");
      const grossEs = gross.toLocaleString("es-ES");

      if (Number.isNaN(unitPrice)) {
        throw new Error(
          `Cannot calculate unit price for invoice ${invoice.id}`
        );
      }

      const isClientsVaris = taxPercentEs === "0,21" && country !== "ES";

      const contactFields = isClientsVaris
        ? { "Contact NIF": "CLIENTS_VARIS" }
        : {
            "Contact name": invoice["Customer Name"],
            "Contact NIF": customer["Business Vat ID"],
            Address: `${invoice["Customer Address Line1"]} - ${invoice["Customer Address Line2"]}`,
            City: invoice["Customer Address City"],
            "Postal code": invoice["Customer Address Zip"],
            Province: invoice["Customer Address State"],
            Country: country,
          };

      const transactionFields = shouldHaveTransaction
        ? {
            "Collected amount": grossEs,
            "Collected date": transaction.available_on,
            "Due date dd/mm/yyyy": transaction.available_on,
          }
        : {};

      return {
        "Invoice num": invoice.Number,
        "Date dd/mm/yyyy": invoice["Date (UTC)"],
        Description: invoice.Subscription,
        Concept: invoice.Subscription,
        "Product description": "Premium Plan - Planning Poker Online",
        SKU: 1,
        "Unit price": unitPriceEs,
        Units: 1,
        "Discount %": 0,
        "IVA %": taxPercentEs,
        "Charge account": "57200001",
        ...contactFields,
        ...transactionFields,
      };
    });
};

run()
  .then(async (holdedInvoices) => {
    log("Exporting CSV...");

    const csv = new ObjectsToCsv(holdedInvoices);

    await csv.toDisk("./output/holded_invoices.csv");

    log(chalk.green("File exported successfully: holded_invoices.csv"));
  })
  .catch((error) => {
    console.error("Error:");
    console.error(error.message);
  });
