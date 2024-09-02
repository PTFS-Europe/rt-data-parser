/** Imports */
import axios from "axios";
import cliProgress from "cli-progress";
import colors from "ansi-colors";
import { Command } from "commander";
import inquirer from "inquirer";
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
  .requiredOption("-o, --output_file <output_file>", "CSV outputfile")
  .requiredOption(
    "-h, --host <host>",
    "RT host URL, e.g. http://localhost:8080"
  )
  .option(
    "-i, --ticket-id <ticket_id>",
    "Top-most RT ticket id to parse"
  )
  .option(
    "-n, --numbers <numbers>",
    "How many tickets to parse, from --ticket-id downards"
  )
  .option(
    "-g, --customer_group <customer_group>",
    "Optional, the customer group RT ID to export data for."
  )
  .parse()
  .opts();

/** Setup constants */
let REQUEST_HEADERS = {
  auth: {
    username: CLI_PARAMS.username,
  },
};
const OUTPUT_FILE = CLI_PARAMS.output_file;
const CUSTOMER_GROUP = CLI_PARAMS.customer_group;
const TOP_TICKET_ID = CLI_PARAMS.ticketId;
let HOW_MANY_TICKETS = CLI_PARAMS.numbers;
const RT_API_URL = `${CLI_PARAMS.host}/REST/2.0`;
const STREAM = fs.createWriteStream("error.log", { flags: "a" });

const password_input = [
  {
    type: "password",
    name: "password",
    message: "Enter password for user "+CLI_PARAMS.username+" at "+CLI_PARAMS.host+":",
  },
];

await inquirer.prompt(password_input).then((answers) => {
  REQUEST_HEADERS.auth.password = answers.password;
});

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
    if (err.response.status === 401) {
      console.log('ERROR: '+err.response.status+' '+err.response.statusText);
    }
    STREAM.write("[ERROR]: Ticket id: " + ticket_id + ": " + err + "\n");
  }
}

async function get_customer_group_data() {
  return await axios
    .get(
      `${RT_API_URL}/tickets?page=1&per_page=20&query=requestor=${CUSTOMER_GROUP}`,
      REQUEST_HEADERS
    )
    .then((response) => {
      return response.data;
    });
}

async function process_customer_group_page(args) {


  let cg_data;
  if(!args.cg_data && args.next_page) {
      cg_data = await axios
        .get(args.next_page, REQUEST_HEADERS)
        .then((response) => {
          return response.data;
        });
  }else{
    cg_data = args.cg_data;
  }
  
  let cg_promises = [];
  cg_data.items.forEach((ticket) => {
    const promise = parse_ticket(ticket.id).then((res) => {
      PROGRESS_BAR_1.increment();
      //Output csv ticket row
      try {
        const row_data = "\n" + Object.values(res).toString();
        fs.appendFile(OUTPUT_FILE, row_data, (err) => {
          if (err) {
            console.error(err);
          } else {
            // file written successfully
          }
        });
      } catch (err) {
        STREAM.write("[ERROR]: Ticket id: " + id + ": " + err + "\n");
      }
    });
    cg_promises.push(promise);
  });
  Promise.all(cg_promises).then(() => {
    if (cg_data.next_page) {
      process_customer_group_page({next_page: cg_data.next_page});
    }else{
      STREAM.end();
      MULTIBAR.stop();
    }
  });
}

/**
 * Retrieves ticket data for a specified range of ticket IDs.
 *
 * @return {Promise<void>} - Resolves when all ticket data has been retrieved.
 */
async function get_tickets_data() {

  if(CUSTOMER_GROUP){
    
    const cg_data = await get_customer_group_data();
    HOW_MANY_TICKETS = cg_data.total;

    PROGRESS_BAR_1.start(HOW_MANY_TICKETS, 0);
    PROGRESS_BAR_1.update({
      message: `Processing tickets...`,
    });

    await process_customer_group_page({cg_data: cg_data});

  }else{
    
    PROGRESS_BAR_1.start(HOW_MANY_TICKETS, 0);
    PROGRESS_BAR_1.update({
      message: `Processing tickets...`,
    });

    STREAM.write(
      `[INFO]: Processing ${HOW_MANY_TICKETS} tickets from ticket id #${TOP_TICKET_ID} \n`
    );

    //Output CSV header columns
    const headings_content = get_column_headings().join(",");
    fs.writeFile(OUTPUT_FILE, headings_content, (err) => {
      if (err) {
        console.error(err);
      } else {
        // file written successfully
      }
    });

    let promises = [];
    for (let id = TOP_TICKET_ID; id > TOP_TICKET_ID - HOW_MANY_TICKETS; id--) {
      const promise = parse_ticket(id).then((res) => {
        PROGRESS_BAR_1.increment();
        //Output csv ticket row
        try {
          const row_data = "\n" + Object.values(res).toString();
          fs.appendFile(OUTPUT_FILE, row_data, (err) => {
            if (err) {
              console.error(err);
            } else {
              // file written successfully
            }
          });
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

  let first_correspondence_str = strip_html_block(
    array_to_string(create_transactions),
    "blockquote"
  );
  first_correspondence_str = strip_html_block(first_correspondence_str, "html");

  // first_correspondence_str = strip_html_tags(first_correspondence_str);

  const correspond_transactions =
    await get_ticket_transactions_history_data_by_type(
      ticket_transactions_history_data,
      "Correspond"
    );

  let correspondence_str = strip_html_block(
    array_to_string(correspond_transactions),
    "blockquote"
  );
  correspondence_str = strip_html_block(correspondence_str, "html");

  // correspondence_str = strip_html_tags(correspondence_str);

  let comments_str = strip_html_tags(array_to_string(comment_transactions));

  let column_headings = get_column_headings();
  return {
    [column_headings[0]]: ticket_data.EffectiveId.id,
    [column_headings[1]]: ticket_data.EffectiveId.id,
    [column_headings[2]]: 13018,
    // any_comment: comments_str, #no mapping yet
    [column_headings[3]]: convert_date(ticket_data.Resolved),
    // created: convert_date(ticket_data.Created), #this doesnt seem to be working, openCRM sets this to time of import
    // customer: ticket_data.Creator.id,
    // customer_group: ticket_user.Organization,
    [column_headings[4]]: convert_date(ticket_data.Resolved),
    [column_headings[5]]: get_ticket_custom_field_value(
      ticket_data.CustomFields,
      "Outcome"
    ),
    [column_headings[6]]: "Support",
    [column_headings[7]]: ticket_queue.Name,
    [column_headings[8]]: "--Please Select--",
    [column_headings[9]]: 334,

    [column_headings[10]]:
      get_ticket_custom_field_value(
        ticket_data.CustomFields,
        "Security Incident"
      ).length == 0
        ? "No"
        : get_ticket_custom_field_value(
            ticket_data.CustomFields,
            "Security Incident"
          )[0],
    [column_headings[11]]: "Archived", //This is hardcoded, if not: ticket_data.Status,
    [column_headings[12]]: '"' + ticket_data.Subject.replace(/"/g, '\\"') + '"',
    [column_headings[13]]:
      '"' +
      get_severity_mapping_value(ticket_data.SLA.replace(/"/g, '\\"')) +
      '"',
    [column_headings[14]]: get_ticket_custom_field_value(
      ticket_data.CustomFields,
      "TicketType"
    ),
    [column_headings[15]]: get_user_mapping_value(ticket_data.Owner.id),
    [column_headings[16]]: ticket_user.Organization,
    [column_headings[17]]:
      '"' + first_correspondence_str + correspondence_str + '"',
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
  return he
    .decode(JSON.stringify(array))
    ?.replace(/['"]+/g, "")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t");
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

/**
 * Retrieves the column headings for a data table.
 *
 * @return {Array} Array of column headings
 */
function get_column_headings() {
  return [
    "Imported Ticket ID",
    "External ID",
    "Contact ID",
    "Closed On (Date)",
    "Last Action Date",
    "Outcome",
    "Support Queue",
    "System",
    "Component",
    "Related To",
    "Security Incident",
    "Status",
    "Title",
    "Severity",
    "Type",
    "Assigned User",
    "Customer Code HD",
    "Description",
  ];
}

/**
 * Retrieves the severity mapping values.
 *
 * @return {Array} Array of severity mapping values
 */
function get_severity_mapping_value(rt_sla) {
    let mapping = {
    'Minor':'P3. Minor',
    'Moderate': 'P2. Major',
    'Severe': 'P1. Critical',
  };

  return mapping[rt_sla];
}

/**
 * Returns the value from the mapping corresponding to the given user.
 *
 * @param {string} rt_user - The user for whom the mapping value is to be retrieved
 * @return {string|number} The value from the mapping for the given user
 */
function get_user_mapping_value(rt_user) {
  let mapping = {
    'alexander': 'Alexander',
    'andrew': 'Andrew',
    'aude': 'Aude',
    'bernard': 'Bernard',
    'david': 'David',
    'fiona': 'Fiona',
    'helen': 'Helen',
    'jacob': 'Jacob',
    'jake': 'Jake',
    'janet': 'Janet',
    'jonathan': 'Jonathan',
    'lucy': 'Lucy',
    'martin': 'Martin',
    'matt': 'Matt',
    'nason': 'Nason',
    'Nobody': 1,
    'pedro': 'Pedro',
    'rachel': 'Rachel',
    'rasa': 'Rasa',
    'ryan': 'Ryan',
    'sam': 'Sam',
    'steven': 'Steven',
    'val': 'Val',
  };

  return mapping[rt_user];
}