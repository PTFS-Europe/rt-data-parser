/** Imports */
const axios = require("axios");
const cliProgress = require("cli-progress");
const colors = require("ansi-colors");
const commander = require("commander");

/** Setup CLI args */
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
const PROGRESS_BAR_2 = MULTIBAR.create(1, 0, 0, {
  format:
    colors.green("{bar}") +
    " | {percentage}% | {message} | {value}/{total} | ETA: {eta_formatted} | Duration: {duration_formatted}",
});

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

let ticket_objs = [];

/** Main */
get_tickets_data(TOP_TICKET_ID, HOW_MANY_TICKETS).then(() =>
  console.log(convert_to_csv(ticket_objs))
);

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
    ticket_objs.push(ticket_obj);
  } catch (error) {
    //Couldnt fetch ticket ${ticket_id}
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
  PROGRESS_BAR_2.update(0, { message: `Waiting on transaction data` });
  bar1_progress = 1;
  for (let id = TOP_TICKET_ID; id > TOP_TICKET_ID - HOW_MANY_TICKETS; id--) {
    PROGRESS_BAR_1.update(bar1_progress++, {
      message: `Parsing RT ticket #${id}`,
    });
    await parse_ticket(id);
  }
  MULTIBAR.stop();
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
  let progress = 1;

  const get_ticket_history_page = async (page) => {
    return await axios
      .get(
        `${RT_API_URL}/ticket/${ticket_id}/history?page=${page}`,
        REQUEST_HEADERS
      )
      .then((response) => {
        return response.data;
      });
  };

  const push_transaction = (transaction) => {
    transactions.push(transaction);
    PROGRESS_BAR_2.update(progress++, {
      message: `Parsing transaction #${transaction.id}`,
    });
  };

  const ticket_history = await get_ticket_history_page(page);
  PROGRESS_BAR_2.start(ticket_history.total, 0);
  PROGRESS_BAR_2.update(0, { message: `Waiting on transaction data` });
  for (let i = 0; i < ticket_history.items.length; i++) {
    try {
      await parse_transaction(ticket_history.items[i].id).then((response) => {
        push_transaction(response);
      });
    } catch (err) {
      //TODO: Put this in an error string
      // console.log(err);
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
          //TODO: Put this in an error string
          // console.log(err);
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
 * Converts an array of objects into a comma-separated values (CSV) format.
 *
 * @param {Array} arr - The array of objects to be converted.
 * @return {string} - The CSV representation of the array of objects.
 */
function convert_to_csv(arr) {
  const array = [Object.keys(arr[0])].concat(arr);

  return array
    .map((it) => {
      return Object.values(it).toString();
    })
    .join("\n");
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
  const comments = await get_ticket_transactions_history_data_by_type(
    ticket_transactions_history_data,
    "Comment"
  );

  const correspondence = await get_ticket_transactions_history_data_by_type(
    ticket_transactions_history_data,
    "Correspond"
  );

  return {
    id: ticket_data.EffectiveId.id,
    all_other_correspondence: correspondence,
    any_comment: comments,
    closed: ticket_data.Resolved,
    created: ticket_data.Created,
    customer: ticket_data.Creator.id,
    customer_group: ticket_user.Organization,
    first_correspondence: ticket_data.Started,
    last_correspondence: ticket_data.Told,
    outcome: get_ticket_custom_field_value(ticket_data.CustomFields, "Outcome"),
    owner: ticket_data.Owner.id,
    queue: ticket_queue.Name,
    security_incident: get_ticket_custom_field_value(
      ticket_data.CustomFields,
      "Security Incident"
    ),
    status: ticket_data.Status,
    subject: ticket_data.Subject,
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
  return custom_fields
    .find((obj) => {
      return obj.name === field_name;
    })
    .values.join(", ");
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
  for (i = 0; i < transactions.length; i++) {
    const hyperlinks = transactions[i]._hyperlinks;

    /**debug */
    // if (transaction_type === "Correspond") {
    //   console.log("transaction id is" + transactions[i].id);
    //   console.log("hi");
    // }
    /**debug */

    for (j = 0; j < hyperlinks.length; j++) {
      const hyperlink = hyperlinks[j];
      if (hyperlink.ref !== "attachment") {
        continue;
      }
      try {
        const response = await axios.get(hyperlink._url, REQUEST_HEADERS);

        /**debug only */
        // if (transaction_type === "Correspond") {
        //   console.log(hyperlink._url);
        //   console.log(
        //     response.data.Headers.includes("Content-Type: text/html")
        //   );
        //   console.log("id");
        // }
        //*debug only*/

        if (is_content_type_text(response.data.Headers)) {
          const obj = {
            created: response.data.Created,
            creator: response.data.Creator.id,
            content: atob(response.data.Content.replace(/\n+/g, "")),
          };
          return_transactions.push(obj);
        }
      } catch (error) {
        // Handle error
      }
    }
  }
  return '"' + JSON.stringify(return_transactions)?.replace(/['"]+/g, "") + '"';
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
