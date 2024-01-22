/** Imports */
import axios from "axios";
import cliProgress from "cli-progress";
import colors from "ansi-colors";
import { Command } from "commander";
import he from "html-entities";
import fs from "fs";
import {
  strip_html_block,
  convert_date,
  strip_html_tags,
} from "./lib/functions.js";

/** Setup CLI args */
const commander = new Command();
const CLI_PARAMS = commander
  .requiredOption("-u, --username <username>", "RT account username")
  .requiredOption("-p, --password <password>", "RT account password")
  .requiredOption(
    "-h, --host <host>",
    "RT host URL, e.g. http://localhost:8080"
  )
  .requiredOption(
    "-i, --ticket-id <ticket_id>",
    "Top-most RT ticket id to parse"
  )
  .requiredOption(
    "-n, --numbers <numbers>",
    "How many tickets to parse, from --ticket-id downards"
  )
  .parse()
  .opts();

/** Setup progress bars */
const MULTIBAR = new cliProgress.MultiBar(
  {
    clearOnComplete: false,
    hideCursor: true,
    autopadding: true,
    format:
      colors.cyan("{bar}") +
      " | {percentage}% | {message} | {value}/{total} | ETA: {eta_formatted} | Duration: {duration_formatted}",
  },
  cliProgress.Presets.shades_grey
);

const PROGRESS_BAR_1 = MULTIBAR.create(1, 0);

/** Setup constants */
const REQUEST_HEADERS = {
  auth: {
    username: CLI_PARAMS.username,
    password: CLI_PARAMS.password,
  },
};
const TOP_TICKET_ID = CLI_PARAMS.ticketId;
const HOW_MANY_TICKETS = CLI_PARAMS.numbers;
const RT_API_URL = `${CLI_PARAMS.host}/REST/2.0`;
const STREAM = fs.createWriteStream("error.log", { flags: "a" });

/** Main */
get_tickets_data(TOP_TICKET_ID, HOW_MANY_TICKETS);

/**
 * Parses a ticket by fetching and processing data from the RT API.
 *
 * @param {number} ticket_id - The ID of the ticket to parse.
 * @return {Promise<void>} - A Promise that resolves when the ticket has been parsed.
 */
async function parse_ticket(ticket_id) {
  try {
    const ticket_data = await axios
      .get(`${RT_API_URL}/ticket/${ticket_id}`, REQUEST_HEADERS)
      .then((response) => {
        return response.data;
      });

    const ticket_user = await axios
      .get(`${RT_API_URL}/user/${ticket_data.Creator.id}`, REQUEST_HEADERS)
      .then((response) => {
        return response.data;
      });

    const ticket_queue = await axios
      .get(`${RT_API_URL}/queue/${ticket_data.Queue.id}`, REQUEST_HEADERS)
      .then((response) => {
        return response.data;
      });

    const ticket_transactions_history_data =
      await get_ticket_transactions_history_data(ticket_id);

    let ticket_obj = await create_ticket_obj(
      ticket_data,
      ticket_user,
      ticket_queue,
      ticket_transactions_history_data
    );
    return ticket_obj;
  } catch (err) {
    STREAM.write("[ERROR]: Ticket id: " + ticket_id + ": " + err + "\n");
  }
}

/**
 * Retrieves ticket data for a specified range of ticket IDs.
 *
 * @param {number} TOP_TICKET_ID - The highest ticket ID in the range.
 * @param {number} HOW_MANY_TICKETS - The number of tickets to retrieve.
 * @return {Promise<void>} - Resolves when all ticket data has been retrieved.
 */
async function get_tickets_data(TOP_TICKET_ID, HOW_MANY_TICKETS) {
  PROGRESS_BAR_1.start(HOW_MANY_TICKETS, 0);
  PROGRESS_BAR_1.update({
    message: `Processing tickets...`,
  });

  STREAM.write(
    `[INFO]: Processing ${HOW_MANY_TICKETS} tickets from ticket id #${TOP_TICKET_ID} \n`
  );

  //Output CSV header columns
  console.log(
    "id,all_other_correspondence,any_comment,closed,created,customer,customer_group,first_correspondence,last_correspondence,outcome,owner,queue,security_incident,status,subject,sla,tickettype"
  );

  let promises = [];
  for (let id = TOP_TICKET_ID; id > TOP_TICKET_ID - HOW_MANY_TICKETS; id--) {
    const promise = parse_ticket(id).then((res) => {
      PROGRESS_BAR_1.increment();
      //Output csv ticket row
      try {
        console.log(Object.values(res).toString());
      } catch (err) {
        STREAM.write("[ERROR]: Ticket id: " + id + ": " + err + "\n");
      }
    });
    promises.push(promise);
  }
  Promise.all(promises).then(() => {
    STREAM.end();
    MULTIBAR.stop();
  });
}

/**
 * Retrieves the transaction history data for a given ticket.
 *
 * @param {string} ticket_id - The ID of the ticket.
 * @return {Array} An array of transaction objects representing the ticket's history.
 */
async function get_ticket_transactions_history_data(ticket_id) {
  let transactions = [];
  let page = 1;

  let bar2 = MULTIBAR.create(1, 0, 0, {
    format:
      colors.green("{bar}") +
      " | {percentage}% | {message} | {value}/{total} | ETA: {eta_formatted} | Duration: {duration_formatted}",
  });

  const get_ticket_history_page = async (page) => {
    return await axios
      .get(
        `${RT_API_URL}/transactions?page=${page}&query=[ { "field": "Type", "operator": "=", "value": "Comment" }, { "field": "Type", "operator": "=", "value": "Correspond" }, { "field": "Type", "operator": "=", "value": "Create" }, { "field": "ObjectId", "operator": "=", "value": ${ticket_id} } ]`,
        REQUEST_HEADERS
      )
      .then((response) => {
        return response.data;
      });
  };

  const update_bar = (transaction_id) => {
    bar2.increment();
    if (transaction_id) {
      bar2.update({
        message: `Ticket #${ticket_id} | Parsing transaction #${transaction_id}`,
      });
    }
    if (bar2.getProgress() == 1) {
      MULTIBAR.remove(bar2);
    }
  };

  const push_transaction = (transaction) => {
    transactions.push(transaction);
    update_bar(transaction.id);
  };

  const ticket_history = await get_ticket_history_page(page);
  bar2.start(ticket_history.total, 1);
  for (let i = 0; i < ticket_history.items.length; i++) {
    try {
      await parse_transaction(ticket_history.items[i].id).then((response) => {
        push_transaction(response);
      });
    } catch (err) {
      update_bar();
      STREAM.write(
        "[ERROR]: Ticket id: " +
          ticket_id +
          " | Transaction id: " +
          ticket_history.items[i].id +
          ": " +
          err +
          "\n"
      );
    }
  }

  if (ticket_history.pages > 1) {
    page++;
    while (page <= ticket_history.pages) {
      const ticket_history = await get_ticket_history_page(page++);
      for (let i = 0; i < ticket_history.items.length; i++) {
        try {
          await parse_transaction(ticket_history.items[i].id).then(
            (response) => {
              push_transaction(response);
            }
          );
        } catch (err) {
          update_bar();
          STREAM.write(
            "[ERROR]: Ticket id: " +
              ticket_id +
              " | Transaction id: " +
              ticket_history.items[i].id +
              ": " +
              err +
              "\n"
          );
        }
      }
    }
  }

  return transactions;
}

/**
 * Retrieves and parses a transaction from the RT API.
 *
 * @param {string} transaction_id - The ID of the transaction to retrieve.
 * @return {Promise} A promise that resolves with the parsed transaction data.
 */
async function parse_transaction(transaction_id) {
  return await axios
    .get(`${RT_API_URL}/transaction/${transaction_id}`, REQUEST_HEADERS)
    .then((response) => {
      return response.data;
    });
}

/**
 * Creates a ticket object based on the provided ticket data, user information, queue, and transaction history.
 *
 * @param {object} ticket_data - The data of the ticket.
 * @param {object} ticket_user - The user associated with the ticket.
 * @param {object} ticket_queue - The queue the ticket belongs to.
 * @param {array} ticket_transactions_history_data - The transaction history data of the ticket.
 * @return {object} - The created ticket object.
 */
async function create_ticket_obj(
  ticket_data,
  ticket_user,
  ticket_queue,
  ticket_transactions_history_data
) {
  const comment_transactions =
    await get_ticket_transactions_history_data_by_type(
      ticket_transactions_history_data,
      "Comment"
    );

  const create_transactions =
    await get_ticket_transactions_history_data_by_type(
      ticket_transactions_history_data,
      "Create"
    );

  const correspond_transactions =
    await get_ticket_transactions_history_data_by_type(
      ticket_transactions_history_data,
      "Correspond"
    );

  const correspondence = create_transactions.concat(correspond_transactions);
  let correspondence_str = strip_html_block(
    array_to_string(correspondence),
    "blockquote"
  );
  correspondence_str = strip_html_block(correspondence_str, "html");

  correspondence_str = strip_html_tags(correspondence_str);

  let comments_str = strip_html_tags(array_to_string(comment_transactions));

  return {
    id: ticket_data.EffectiveId.id,
    all_other_correspondence: correspondence_str,
    any_comment: comments_str,
    closed: convert_date(ticket_data.Resolved),
    created: convert_date(ticket_data.Created),
    customer: ticket_data.Creator.id,
    customer_group: ticket_user.Organization,
    first_correspondence: convert_date(ticket_data.Started),
    last_correspondence: convert_date(ticket_data.Told),
    outcome: get_ticket_custom_field_value(ticket_data.CustomFields, "Outcome"),
    owner: ticket_data.Owner.id,
    queue: ticket_queue.Name,
    security_incident: get_ticket_custom_field_value(
      ticket_data.CustomFields,
      "Security Incident"
    ),
    status: ticket_data.Status,
    subject: '"' + ticket_data.Subject.replace(/"/g, '\\"') + '"',
    sla: '"' + ticket_data.SLA.replace(/"/g, '\\"') + '"',
    tickettype: get_ticket_custom_field_value(
      ticket_data.CustomFields,
      "TicketType"
    ),
  };
}

/**
 * Retrieves the value of a custom field from the given array of custom fields based on the field name.
 *
 * @param {Array} custom_fields - An array of custom field objects.
 * @param {string} field_name - The name of the field to retrieve the value for.
 * @return {string} - The value of the custom field, joined by commas if it contains multiple values.
 */
function get_ticket_custom_field_value(custom_fields, field_name) {
  return custom_fields.find((obj) => {
    return obj.name === field_name;
  }).values;
}

/**
 * Retrieves a list of transactions of a specific type from the ticket transactions history data.
 *
 * @param {Array} ticket_transactions_history_data - The array of ticket transactions history data.
 * @param {string} transaction_type - The type of transaction to filter for.
 * @return {string} - A JSON string representation of the filtered transactions.
 */
async function get_ticket_transactions_history_data_by_type(
  ticket_transactions_history_data,
  transaction_type
) {
  let transactions = ticket_transactions_history_data.filter((obj) => {
    return obj.Type === transaction_type;
  });

  let return_transactions = [];
  for (let i = 0; i < transactions.length; i++) {
    const hyperlinks = transactions[i]._hyperlinks;
    for (let j = 0; j < hyperlinks.length; j++) {
      const hyperlink = hyperlinks[j];
      if (hyperlink.ref !== "attachment") {
        continue;
      }
      try {
        const response = await axios.get(hyperlink._url, REQUEST_HEADERS);
        if (is_content_type_text(response.data.Headers)) {
          const obj = {
            created: convert_date(response.data.Created),
            creator: response.data.Creator.id,
            content: atob(response.data.Content.replace(/\n+/g, "")),
          };
          return_transactions.push(obj);
        }
      } catch (err) {
        STREAM.write(
          "[ERROR]: Attachment id: " + hyperlink.id + ": " + err + "\n"
        );
      }
    }
  }
  return return_transactions;
}

function array_to_string(array) {
  return '"' + he.decode(JSON.stringify(array))?.replace(/['"]+/g, "") + '"';
}

/**
 * Check if the given response headers indicate a text content type.
 *
 * @param {string} response_headers - The response headers to check.
 * @return {boolean} Returns true if the response headers indicate a text content type, false otherwise.
 */
function is_content_type_text(response_headers) {
  return (
    response_headers.toLowerCase().includes("content-type: text/html") ||
    response_headers.toLowerCase().includes("content-type: text/plain")
  );
}
