import { money, percent, signed } from "./format.js";

const RECENT_LIMIT = 5;

export function renderAccounts(node, accounts) {
  if (accounts.length === 0) {
    node.replaceChildren(line("p", "No accounts to show.", "meta"));
    return;
  }
  node.replaceChildren(...accounts.map(accountCard));
}

function accountCard(account) {
  const card = document.createElement("article");
  card.className = "card";
  card.append(
    line("h2", account.name),
    line("p", money(account.balance), "balance"),
    line(
      "p",
      `${account.type} · ${percent(account.annual_rate)} a year · interest to ${account.last_interest ?? "—"}`,
      "meta",
    ),
  );
  return card;
}

export function renderActivity(node, transactions, limit = RECENT_LIMIT) {
  if (transactions.length === 0) {
    node.replaceChildren(line("li", "No transactions yet.", "meta"));
    return;
  }
  node.replaceChildren(...transactionRows(transactions.slice(0, limit)));
}

export function transactionRows(transactions) {
  return transactions.map(activityRow);
}

function activityRow(transaction) {
  const item = document.createElement("li");
  item.className = `row ${transaction.type}`;
  item.append(
    line(
      "span",
      `${transaction.account} · ${transaction.description}`,
      "detail",
    ),
    line("span", signed(transaction.amount), "amount"),
    line("time", transaction.datetime, "meta"),
  );
  return item;
}

export function renderAccountOptions(select, accounts) {
  select.replaceChildren(
    ...accounts.map((account) => {
      const option = document.createElement("option");
      option.value = account.name;
      option.textContent = account.name;
      return option;
    }),
  );
}

function line(tag, text, className) {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  return element;
}
