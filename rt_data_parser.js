/** Use Axios */
const axios = require("axios");

/** Set username and password from CLI params */
const request_headers = {
  auth: {
    username: process.argv[2],
    password: process.argv[3],
  },
};

/** Setup */
const RT_API_URL = "https://helpdesk.ptfs-europe.com/REST/2.0";
const ids = ["48370", "48371", "48372"];
let tickets = [];

/** Requests */
const parse_ticket = async (ticket_id) => {
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

  const ticket_history = await axios
    .get(`${RT_API_URL}/ticket/${ticket_id}/history`, request_headers)
    .then((response) => {
      return response.data;
    });

  let data_ticket = create_ticket_obj(ticket_id, ticket_data, ticket_user, ticket_history);
  tickets.push(data_ticket);
};

/** Call the functions */
get_tickets_data(ids).then(() => console.log(convert_to_csv(tickets)));

/**
 * Asynchronously retrieves ticket data for each ID in the given array.
 *
 * @param {Array} ids - An array of ticket IDs.
 * @return {Promise} A promise that resolves when all ticket data has been retrieved.
 */
async function get_tickets_data(ids) {
  for (let i = 0; i < ids.length; i++) {
    await parse_ticket(ids[i]);
  }
}

/**
 * Converts an array of objects to a CSV dataset.
 *
 * @param {Array} arr - The array of objects to convert.
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
 * @param {number} ticket_id - The ID of the ticket.
 * @param {object} ticket_data - The data of the ticket.
 * @param {object} ticket_user - The user associated with the ticket.
 * @param {object} ticket_history - The history of the ticket.
 * @returns {object} The created ticket object.
 */
function create_ticket_obj(ticket_id, ticket_data, ticket_user, ticket_history) {
  return {
    id: ticket_data.EffectiveId.id,
    all_other_correspondence: `TODO - get this from ${RT_API_URL}/ticket/${ticket_id}/history ?`,
    any_comment: `TODO - get this from ${RT_API_URL}/ticket/${ticket_id}/history ?`,
    closed: ticket_data.Resolved,
    created: ticket_data.Created,
    customer: ticket_data.Creator.id,
    customer_group: ticket_user.Organization,
    first_correspondence: "TODO - this needs some digging",
    last_correspondence: ticket_data.Told,
    outcome: 'TODO - search within ticket_data.CustomFields.{name=>"Outcome"}',
    owner: ticket_data.Owner.id,
    queue: "TODO - get this from ${RT_API_URL}/queue/{ticket_data.Queue.id}",
    security_incident:
      'TODO - search within ticket_data.CustomFields.{name=>"TicketType"}',
    status: ticket_data.Status,
    subject: ticket_data.Subject,
    tickettype:
      'TODO - search within ticket_data.CustomFields.{name=>"TicketType"}',
  };
}
