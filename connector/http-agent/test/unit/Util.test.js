const { generateDeviceDataMessage } = require('../../app/Utils');

const tenant = 'test';
const deviceid = 'abc123';
const fakeMessageWithTimestamp = {
  ts: '2021-07-12T09:31:01.683000Z',
  data: {
    temperature: 25.79,
  },
};
const fakeMessageWithUnixTimestamp = {
  ts: '1626082261683',
  data: {
    temperature: 25.79,
  },
};
const fakeMessageWithoutTimestamp = {
  data: {
    temperature: 25.79,
  },
};
const fakeMessageWithInvalidTimestamp = {
  ts: 'invalid',
  data: {
    temperature: 25.79,
  },
};

describe('Util', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should format the message correctly with timestamp', async () => {
    const deviceDataMessage = generateDeviceDataMessage(
      fakeMessageWithTimestamp,
      tenant,
      deviceid,
    );

    const formattedMessage = {
      metadata: {
        deviceid,
        tenant,
        timestamp: Date.parse(fakeMessageWithTimestamp.ts),
      },
      attrs: fakeMessageWithTimestamp.data,
    };

    expect(JSON.stringify(deviceDataMessage)).toEqual(
      JSON.stringify(formattedMessage),
    );
  });

  it('should format the message correctly with unix timestamp', async () => {
    const deviceDataMessage = generateDeviceDataMessage(
      fakeMessageWithUnixTimestamp,
      tenant,
      deviceid,
    );

    const formattedMessage = {
      metadata: {
        deviceid,
        tenant,
        timestamp: Date.parse(fakeMessageWithTimestamp.ts),
      },
      attrs: fakeMessageWithTimestamp.data,
    };

    expect(JSON.stringify(deviceDataMessage)).toEqual(
      JSON.stringify(formattedMessage),
    );
  });

  it('should format the message correctly without timestamp', async () => {
    const deviceDataMessage = generateDeviceDataMessage(
      fakeMessageWithoutTimestamp,
      tenant,
      deviceid,
    );

    const formattedMessage = {
      metadata: {
        deviceid,
        tenant,
        timestamp: expect.any(Number),
      },
      attrs: fakeMessageWithoutTimestamp.data,
    };

    expect(formattedMessage).toEqual(deviceDataMessage);
  });

  it('should format the message correctly with invalid timestamp', async () => {
    let error;
    try {
      generateDeviceDataMessage(
        fakeMessageWithInvalidTimestamp,
        tenant,
        deviceid,
      );
    } catch (err) {
      error = err;
    }
    expect(error.message).toEqual('Invalid timestamp');
  });
});
