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

  const mappedInvoices = invoices
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
            `STATUS PAID BUT TRANSACTION NOT FOUND:
invoice ${invoice.Number}, 
price: ${invoice["Amount Due"]}, 
Amount Due: ${invoice["Amount Due"]}, 
Amount Paid: ${invoice["Amount Paid"]}
---------------------------------`
          )
        );

        return null;
      }

      if (!customer) {
        log(chalk.red(`Customer not found for invoice ${invoice.id}`));

        return null;
      }

      const country = invoice["Customer Address Country"];
      const isInvalidCustomer = !invoice["Customer Name"] || !country;
      const isSpanishWithNoVatId =
        country === "ES" && !customer["Business Vat ID"];
      const taxAmount = stringToNumber(invoice["Tax"]);
      const total = stringToNumber(invoice["Total"]);
      const gross = transaction ? transaction.gross : total;
      const taxPercent =
        (taxAmount && total) || isInvalidCustomer || isSpanishWithNoVatId
          ? 0.21
          : 0;
      const unitPrice = gross / (1 + taxPercent);

      if (Number.isNaN(unitPrice)) {
        log(chalk.red(`Cannot calculate unit price for invoice ${invoice.id}`));

        return null;
      }

      const isClientsVaris =
        (taxPercent === 0.21 && country !== "ES") ||
        isInvalidCustomer ||
        isSpanishWithNoVatId;

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

      if (invoice.id === "in_1OX9IrA3Gc0cJsLhbfRZcvdq") {
        console.log(customer);
      }

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

  return mappedInvoices.filter((invoice) => !!invoice);
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
