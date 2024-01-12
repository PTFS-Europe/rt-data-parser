const axios = require("axios");
const cliProgress = require("cli-progress");
const commander = require("commander");

/** Handle CLI args */
commander
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
  );

commander.parse();
const cli_params = commander.opts();

/** Setup progress bars */
const multibar = new cliProgress.MultiBar(
  {
    clearOnComplete: false,
    hideCursor: true,
    format:
      " {bar} | {message} | {value}/{total} | ETA: {eta_formatted} | Duration: {duration_formatted}",
  },
  cliProgress.Presets.shades_grey
);

const b1 = multibar.create(200, 0);
const b2 = multibar.create(1000, 0);

/** Set username and password from CLI params */
const request_headers = {
  auth: {
    username: cli_params.username,
    password: cli_params.password,
  },
};

const newest_id = cli_params.ticketId;
const how_many = cli_params.numbers;

/** Setup */
const RT_API_URL = `${cli_params.host}/REST/2.0`;
let ticket_objs = [];

/** Do the work */
get_tickets_data(newest_id, how_many).then(() =>
  console.log(convert_to_csv(ticket_objs))
);

/**
 * Asynchronously parses a ticket.
 *
 * @param {number} ticket_id - The ID of the ticket to parse.
 * @return {void} This function does not return a value.
 */
async function parse_ticket(ticket_id) {
  try {
    const ticket_data = await axios
      .get(`${RT_API_URL}/ticket/${ticket_id}`, request_headers)
      .then((response) => {
        return response.data;
      });

    const ticket_user = await axios
      .get(`${RT_API_URL}/user/${ticket_data.Creator.id}`, request_headers)
      .then((response) => {
        return response.data;
      });

    const ticket_queue = await axios
      .get(`${RT_API_URL}/queue/${ticket_data.Queue.id}`, request_headers)
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
 * Asynchronously retrieves and parses ticket data for the given IDs.
 *
 * @param {Array} ids - An array of ticket IDs
 * @return {Promise} - A promise that resolves when all tickets have been parsed
 */
async function get_tickets_data(newest_id, how_many) {
  b1.start(how_many, 0);
  b1_progress = 1;
  for (let id = newest_id; id > newest_id - how_many; id--) {
    b1.update(b1_progress++, { message: `Parsing RT ticket #${id}` });
    await parse_ticket(id);
  }
  multibar.stop();
}

/**
 * Retrieves the ticket history data for a given ticket ID.
 *
 * @param {string} ticket_id - The ID of the ticket.
 * @return {Array} An array of transaction objects representing the ticket history.
 */
async function get_ticket_transactions_history_data(ticket_id) {
  let transactions = [];
  let page = 1;
  let progress = 1;

  const get_ticket_history_page = async (page) => {
    return await axios
      .get(
        `${RT_API_URL}/ticket/${ticket_id}/history?page=${page}`,
        request_headers
      )
      .then((response) => {
        return response.data;
      });
  };

  const push_transaction = (transaction) => {
    transactions.push(transaction);
    b2.update(progress++, {
      message: `Processing transaction #${transaction.id}`,
    });
  };

  const ticket_history = await get_ticket_history_page(page);
  b2.start(ticket_history.total, 0);
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
 * Retrieves and parses a transaction from the server.
 *
 * @param {string} transaction_id - The ID of the transaction to retrieve.
 * @return {Promise} A promise that resolves to the parsed transaction data.
 */
async function parse_transaction(transaction_id) {
  return await axios
    .get(`${RT_API_URL}/transaction/${transaction_id}`, request_headers)
    .then((response) => {
      return response.data;
    });
}

/**
 * Converts an array of objects into a CSV string representation.
 *
 * @param {Array} arr - The array of objects to be converted.
 * @return {string} - The CSV string representation of the array.
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
 * Creates a ticket object based on the provided ticket data.
 *
 * @param {Object} ticket_data - The data of the ticket.
 * @param {Object} ticket_user - The user associated with the ticket.
 * @param {Object} ticket_queue - The queue associated with the ticket.
 * @param {Object[]} ticket_transactions_history_data - The transaction history data of the ticket.
 * @return {Object} The created ticket object.
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
 * Returns the value of a custom field in an array of custom fields.
 *
 * @param {array} custom_fields - An array of custom fields objects.
 * @param {string} field_name - The name of the field to search for.
 * @return {string} The joined values of the matching field.
 */
function get_ticket_custom_field_value(custom_fields, field_name) {
  return custom_fields
    .find((obj) => {
      return obj.name === field_name;
    })
    .values.join(", ");
}

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
        const response = await axios.get(hyperlink._url, request_headers);

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
 * Checks if the given response headers include a content type of "text/html" or "text/plain".
 *
 * @param {Array<string>} response_headers - The response headers to check.
 * @return {boolean} Returns true if the response headers include "Content-Type: text/html" or "Content-Type: text/plain", otherwise returns false.
 */
function is_content_type_text(response_headers) {
  return (
    response_headers.toLowerCase().includes("content-type: text/html") ||
    response_headers.toLowerCase().includes("content-type: text/plain")
  );
}
