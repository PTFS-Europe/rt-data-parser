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
const rt_api_url = "https://helpdesk.ptfs-europe.com/REST/2.0";
const ids = ["48370", "48371", "48372"];
let tickets = [];

/** Requests */
const get_ticket_data = async (ticket_id) => {
  try {
    await axios
      .get(`${rt_api_url}/ticket/${ticket_id}`, request_headers)
      .then((response) => {
        let response_ticket = response.data;

        return axios
          .get(
            `${rt_api_url}/user/${response_ticket.Creator.id}`,
            request_headers
          )
          .then((response) => {
            let response_user = response.data;

            let data_ticket = {
              id: response_ticket.EffectiveId.id,
              all_other_correspondence:
                `TODO - get this from ${rt_api_url}/${ticket_id}/48370/history ?`,
              any_comment:
                `TODO - get this from ${rt_api_url}/${ticket_id}/48370/history ?`,
              closed: response_ticket.Resolved,
              created: response_ticket.Created,
              customer: response_ticket.Creator.id,
              customer_group: response_user.Organization,
              first_correspondence: "TODO - this needs some digging",
              last_correspondence: response_ticket.Told,
              outcome:
                'TODO - search within response_ticket.CustomFields.{name=>"Outcome"}',
              owner: response_ticket.Owner.id,
              queue:
                "TODO - get this from ${rt_api_url}/queue/{response_ticket.Queue.id}",
              security_incident:
                'TODO - search within response_ticket.CustomFields.{name=>"TicketType"}',
              status: response_ticket.Status,
              subject: response_ticket.Subject,
              tickettype:
                'TODO - search within response_ticket.CustomFields.{name=>"TicketType"}',
            };
            tickets.push(data_ticket);
          });
      })
      .catch((error) => {
        console.log(error);
      });
  } catch (error) {
    // Handle errors
  }
};

/** Call the functions */
get_tickets_data(ids).then(() => console.log(convert_to_csv((tickets))));

/**
 * Asynchronously retrieves ticket data for each ID in the given array.
 *
 * @param {Array} ids - An array of ticket IDs.
 * @return {Promise} A promise that resolves when all ticket data has been retrieved.
 */
async function get_tickets_data(ids) {
  for (let i = 0; i < ids.length; i++) {
    await get_ticket_data(ids[i]);
  }
}

/**
 * Converts an array of objects to a CSV string.
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
