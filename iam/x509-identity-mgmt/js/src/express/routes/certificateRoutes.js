const HttpStatus = require('http-status-codes');

const sanitizeParams = require('./sanitizeParams');

const CERT_MODEL = 'certificateModel';
const CERT_SERVICE = 'certificateService';

module.exports = ({ mountPoint, schemaValidator, errorTemplate }) => {
  const { validateRegOrGenCert, validateChangeOwnerCert } = schemaValidator;
  const { Forbidden } = errorTemplate;

  function denyCertForApplMiddleware(req, res, next) {
    const belongsTo = req.body.belongsTo || {};
    if (Object.prototype.hasOwnProperty.call(belongsTo, 'application')) {
      // For now it is not permitted to issue certificates
      // for applications, but in future versions probably
      // the enumerated application 'kafka-consumer' will be allowed.
      return next(Forbidden('Operations on certificates for applications are not authorized through this endpoint.'));
    }
    return next();
  }

  const certsRoute = {
    mountPoint,
    name: 'certificates-route',
    path: ['/certificates'],
    handlers: [
      {
        /* List x.509 Certificates */
        method: 'get',
        middleware: [
          async (req, res) => {
            const model = req.scope.resolve(CERT_MODEL);
            const service = req.scope.resolve(CERT_SERVICE);

            const queryFields = model.parseProjectionFields(req.query.fields);
            const filterFields = model.handleFilterField(req.query.keyVal);
            const sortBy = model.parseSortBy(req.query.sortBy);

            const { itemCount, results } = await service.listCertificates(
              queryFields,
              filterFields,
              req.query.limit,
              req.offset,
              sortBy,
            );

            results.forEach((cert) => model.sanitizeFields(cert));

            const paging = req.getPaging(itemCount);
            res.status(HttpStatus.OK).json({ paging, certificates: results });
          },
        ],
      },
      {
        /* Generate x.509 Certificate from CSR
         * (or also)
         * Register x.509 Certificate Issued by an External CA */
        method: 'post',
        middleware: [
          validateRegOrGenCert(),
          denyCertForApplMiddleware,
          async (req, res) => {
            let result = null;
            const belongsTo = req.body.belongsTo || {};
            const service = req.scope.resolve(CERT_SERVICE);

            // --------------------------------------------------------------
            // Checks the content of the payload to determine whether a
            // certificate should be generated by the platform or whether
            // an external certificate should be registered as trusted.
            if (req.body.csr) {
              // The payload indicates that the request expects a certificate
              // signed by the platform's internal CA to be issued...
              const csr = sanitizeParams.sanitizeLineBreaks(req.body.csr);
              result = await service.generateCertificate({
                csr, belongsTo,
              });
              // ------------------------------------------------------------
            } else if (req.body.certificateChain) {
              // The payload indicates that the request expects to register
              // a certificate signed by a trusted (external) CA...
              const certificateChain = req.body.certificateChain
                .match(sanitizeParams.certRegExp)
                .map((el) => sanitizeParams.sanitizeLineBreaks(el));
              const caFingerprint = sanitizeParams.sanitizeFingerprint(req.body.caFingerprint || '');

              result = await service.registerCertificate({
                caFingerprint, certificateChain, belongsTo,
              });
              // ------------------------------------------------------------
            }
            res.status(HttpStatus.CREATED).json(result);
          },
        ],
      },
    ],
  };

  const certsFingerprintRoute = {
    mountPoint,
    name: 'certificate-fingerprint-route',
    path: ['/certificates/:fingerprint'],
    params: [{
      name: 'fingerprint',
      trigger: sanitizeParams.fingerprintHandler,
    }],
    handlers: [
      {
        /* Get x.509 Certificate */
        method: 'get',
        middleware: [
          async (req, res) => {
            const model = req.scope.resolve(CERT_MODEL);
            const service = req.scope.resolve(CERT_SERVICE);

            const { fingerprint } = req.params;
            const queryFields = model.parseProjectionFields(req.query.fields);
            const filterFields = model.parseConditionFields({ fingerprint });

            const result = await service.getCertificate(queryFields, filterFields);
            model.sanitizeFields(result);

            res.status(HttpStatus.OK).json(result);
          },
        ],
      },
      {
        /* Change the Ownership of a Specified x.509 Certificate */
        method: 'patch',
        middleware: [
          validateChangeOwnerCert(),
          denyCertForApplMiddleware,
          async (req, res) => {
            const model = req.scope.resolve(CERT_MODEL);
            const service = req.scope.resolve(CERT_SERVICE);

            const { fingerprint } = req.params;
            const filterFields = model.parseConditionFields({ fingerprint });

            await service.changeOwnership(filterFields, req.body.belongsTo);

            res.sendStatus(HttpStatus.NO_CONTENT);
          },
        ],
      },
      {
        /* Delete x.509 certificate */
        method: 'delete',
        middleware: [
          async (req, res) => {
            const model = req.scope.resolve(CERT_MODEL);
            const service = req.scope.resolve(CERT_SERVICE);

            const { fingerprint } = req.params;
            const queryFields = model.parseProjectionFields(null);
            const filterFields = model.parseConditionFields({ fingerprint });

            const certToRemove = await service.getCertificate(queryFields, filterFields);
            await service.deleteCertificate(certToRemove);

            res.sendStatus(HttpStatus.NO_CONTENT);
          },
        ],
      },
    ],
  };

  const certsBelongsToRoute = {
    mountPoint,
    name: 'certificate-belongsto-route',
    path: ['/certificates/:fingerprint/belongsto'],
    params: [{
      name: 'fingerprint',
      trigger: sanitizeParams.fingerprintHandler,
    }],
    handlers: [
      {
        /* Delete the ownership of a certificate. */
        method: 'delete',
        middleware: [
          async (req, res) => {
            const model = req.scope.resolve(CERT_MODEL);
            const service = req.scope.resolve(CERT_SERVICE);

            const { fingerprint } = req.params;
            const filterFields = model.parseConditionFields({ fingerprint });

            // to remove the certificate owner, just pass
            // the 'belongsTo' parameter as an empty object
            await service.changeOwnership(filterFields, {});

            res.sendStatus(HttpStatus.NO_CONTENT);
          },
        ],
      },
    ],
  };

  return [certsRoute, certsFingerprintRoute, certsBelongsToRoute];
};
