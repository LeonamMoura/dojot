const {
  ServiceStateManager,
  ConfigManager: { getConfig, transformObjectKeys },
  Logger,
  LocalPersistence: { LocalPersistenceManager },
} = require('@dojot/microservice-sdk');

const path = require('path');

const camelCase = require('lodash.camelcase');

const { lightship: configLightship, sync } = getConfig('RETRIEVER');

const serviceState = new ServiceStateManager({
  lightship: transformObjectKeys(configLightship, camelCase),
});
serviceState.registerService('server');
serviceState.registerService('influxdb');

const logger = new Logger('influxdb-retriever:App');

const Server = require('./Server');
const InfluxDB = require('./influx');
const RetrieverConsumer = require('./kafka/RetrieverConsumer');

const express = require('./express');
const devicesRoutes = require('./express/routes/v1/Devices');
const DeviceService = require('./sync/DeviceService');
const SyncLoader = require('./sync/SyncLoader');
const TenantService = require('./sync/TenantService');

const openApiPath = path.join(__dirname, '../api/v1.yml');


/**
* Wrapper to initialize the service
*/
class App {
  /**
    * Constructor App
    * that instantiate influxdb classes
    */
  constructor() {
    logger.debug('constructor: instantiate app...');
    try {
      this.server = new Server(serviceState);
      this.influxDB = new InfluxDB(serviceState);
      this.localPersistence = new LocalPersistenceManager(logger, true);
      this.retrieverConsumer = new RetrieverConsumer(this.localPersistence);
      this.authService = new TenantService(sync.tenants);
      this.deviceService = new DeviceService(sync.devices);
      this.syncLoader = new SyncLoader(this.localPersistence, this.authService, this.deviceService);
    } catch (e) {
      logger.error('constructor:', e);
      const er = new Error(e);
      er.message = `constructor: ${e.message}`;
      throw er;
    }
  }

  /**
   * Initialize the server and influxdb
   */
  async init() {
    logger.info('init: Initializing the influxdb-retriever...');
    try {
      const influxIsReady = await this.influxDB.getInfluxStateInstance().isReady();
      if (!influxIsReady) {
        throw new Error('Influxdb is not ready');
      }
      this.influxDB.createInfluxHealthChecker();

      const boundQueryDataUsingGraphql = this
        .influxDB.getInfluxDataQueryInstance()
        .queryUsingGraphql.bind(this.influxDB.getInfluxDataQueryInstance());


      const boundQueryDataByField = this
        .influxDB.getInfluxDataQueryInstance()
        .queryByField.bind(this.influxDB.getInfluxDataQueryInstance());

      const boundQueryDataByMeasurement = this
        .influxDB.getInfluxDataQueryInstance()
        .queryByMeasurement.bind(this.influxDB.getInfluxDataQueryInstance());

      this.server.registerShutdown();

      await this.localPersistence.init();
      await this.retrieverConsumer.init();
      this.retrieverConsumer.initCallbackForNewTenantEvents();
      this.retrieverConsumer.initCallbackForDeviceEvents();

      this.syncLoader.load();

      this.server.init(express(
        [
          devicesRoutes({
            localPersistence: this.localPersistence,
            mountPoint: '/tss/v1',
            queryDataUsingGraphql: boundQueryDataUsingGraphql,
            queryDataByField: boundQueryDataByField,
            queryDataByMeasurement: boundQueryDataByMeasurement,
          }),
        ],
        serviceState,
        openApiPath,
      ));
    } catch (e) {
      logger.error('init:', e);
      throw e;
    }
    logger.info('init:...service initialized.');
  }
}

module.exports = App;
