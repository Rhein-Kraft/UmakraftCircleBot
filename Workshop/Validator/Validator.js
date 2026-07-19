// Validator module for Workshop deliverables.
// The Validator inspects completed deliverables against Draftsman specifications and approves or rejects them.

function validateDeliverable(deliverable) {
  if (!deliverable || typeof deliverable !== 'object') {
    throw new Error('Validator requires a valid deliverable object.');
  }
  if (!deliverable.id) {
    throw new Error('Deliverable must include an id.');
  }
}

function validateSpecification(specification) {
  if (!specification || typeof specification !== 'object') {
    throw new Error('Validator requires a valid specification object.');
  }
  if (!specification.id) {
    throw new Error('Specification must include an id.');
  }
}

function validate(deliverable, specification) {
  validateDeliverable(deliverable);
  validateSpecification(specification);

  const issues = [];

  if (deliverable.metadata?.source && deliverable.metadata.source !== specification.id) {
    issues.push('Deliverable source does not match specification id.');
  }

  if (specification.requiredFields && Array.isArray(specification.requiredFields)) {
    const missing = specification.requiredFields.filter((field) => !(field in deliverable.payload));
    if (missing.length) {
      issues.push(`Missing required fields: ${missing.join(', ')}`);
    }
  }

  if (specification.requiredComponents && Array.isArray(specification.requiredComponents)) {
    const missingComponents = specification.requiredComponents.filter(
      (component) => !deliverable.components?.includes(component)
    );
    if (missingComponents.length) {
      issues.push(`Missing required components: ${missingComponents.join(', ')}`);
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

function approve(deliverable) {
  validateDeliverable(deliverable);
  return {
    status: 'approved',
    id: deliverable.id,
    approvedAt: new Date().toISOString(),
  };
}

function reject(deliverable, issues = []) {
  validateDeliverable(deliverable);
  return {
    status: 'rejected',
    id: deliverable.id,
    rejectedAt: new Date().toISOString(),
    issues: Array.isArray(issues) ? issues : [String(issues)],
  };
}

function report(result, deliverable, specification) {
  return {
    deliverableId: deliverable?.id || null,
    specificationId: specification?.id || null,
    status: result.valid ? 'approved' : 'rejected',
    issues: result.issues || [],
    evaluatedAt: new Date().toISOString(),
  };
}

module.exports = function createValidator() {
  return {
    validate,
    approve,
    reject,
    report,
  };
};
