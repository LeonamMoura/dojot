const {
  WebUtils: { createTokenGen },
} = require('@dojot/microservice-sdk');

const createAxios = require('./createAxios');


class DeviceManagerService {
  /**
   * Consumes api that returns devices data
   *
   * @param {string} deviceRouteUrl Url for api that returns data about devices
   */
  constructor(deviceRouteUrl) {
    this.deviceRouteUrl = deviceRouteUrl;
  }

  /**
   * Requires devices data from a tenant for API
   *
   * @param {string} tenant the tenant name
   *
   * @return a list of devices
   */
  async getDevices(tenant) {
    const tokenGen = createTokenGen();
    const token = await tokenGen.generate({ payload: {}, tenant });

    const axios = createAxios();
    const devices = await axios.get(this.deviceRouteUrl, {
      params: {
        idsOnly: true,
      },
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return devices.data;
  }
}

module.exports = DeviceManagerService;
