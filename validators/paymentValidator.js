const { z } = require('zod');

const createPaymentSchema = z.object({}).strict();

module.exports = {
  createPaymentSchema
};