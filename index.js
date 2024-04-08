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

const stripeDateStringToHoldedDateString = (stripeDateString) => {
  const stripeDate = new Date(stripeDateString);

  const holdedDate = `${stripeDate.getDate()}/${
    stripeDate.getMonth() + 1
  }/${stripeDate.getFullYear()}`;

  return holdedDate;
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
      const shouldLog = invoice.id === "in_1OdtNYA3Gc0cJsLhcznbH4iS";
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
      const gross = transaction ? transaction.gross : total;
      const taxPercent = taxAmount && total ? 0.21 : 0;
      const unitPrice = gross / (1 + taxPercent);

      if (shouldLog) {
        console.log("invoice.id", invoice.id);
        console.log("gross", gross);
        console.log("taxAmount", taxAmount);
        console.log("!!transaction", !!transaction);
        console.log("taxPercent", taxPercent);
        console.log("unitPrice", unitPrice);
        console.log("transaction.gross", transaction.gross);
      }

      if (Number.isNaN(unitPrice)) {
        throw new Error(
          `Cannot calculate unit price for invoice ${invoice.id}`
        );
      }

      const isClientsVaris = taxPercent === 0.21 && country !== "ES";

      const contactFields = isClientsVaris
        ? { "Contact NIF": "CLIENTS_VARIS" }
        : {
            "Contact name": invoice["Customer Name"],
            "Contact NIF": customer["Business Vat ID"] || invoice.Customer,
            Address: `${invoice["Customer Address Line1"]} - ${invoice["Customer Address Line2"]}`,
            City: invoice["Customer Address City"],
            "Postal code": invoice["Customer Address Zip"],
            Province: invoice["Customer Address State"],
            Country: country,
          };

      let taxPercentString;

      if (isClientsVaris) {
        taxPercentString = "s_iva_21";
      } else if (contactFields["Contact NIF"].substr(0, 3) === "cus") {
        taxPercentString = "s_iva_export";
      } else if (contactFields["Contact NIF"].substr(0, 2) === "ES") {
        taxPercentString = "s_iva_21";
      } else {
        taxPercentString = "s_iva_intras";
      }

      const transactionFields = shouldHaveTransaction
        ? {
            "Collected amount": gross,
            "Collected date": stripeDateStringToHoldedDateString(
              transaction.available_on
            ),
            "Due date dd/mm/yyyy": stripeDateStringToHoldedDateString(
              transaction.available_on
            ),
          }
        : {};

      return {
        "Invoice num": invoice.Number,
        "Num Format": "",
        "Date dd/mm/yyyy": stripeDateStringToHoldedDateString(
          invoice["Date (UTC)"]
        ),
        "Due date dd/mm/yyyy": transactionFields["Due date dd/mm/yyyy"] || "",
        Description: invoice.Subscription,
        "Contact name": contactFields["Contact name"] || "",
        "Contact NIF": contactFields["Contact NIF"] || "",
        Address: contactFields["Address"] || "",
        City: contactFields["City"] || "",
        "Postal code": contactFields["Postal code"] || "",
        Province: contactFields["Province"] || "",
        Country: contactFields["Country"] || "",
        Concept: invoice.Subscription,
        "Product description": "",
        SKU: "",
        "Unit price": unitPrice,
        Units: 1,
        "Discount %": 0,
        "IVA %": taxPercentString,
        "Retencion %": "",
        "Rec de eq %": "",
        Operation: "",
        "Payment method (ID)": "",
        "Collected amount": transactionFields["Collected amount"] || "",
        "Collected date": transactionFields["Collected date"] || "",
        "Charge account": 57200001,
        "Tags separated by": "",
        "Sales channel name": "",
        "Channel account": 70500000,
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
