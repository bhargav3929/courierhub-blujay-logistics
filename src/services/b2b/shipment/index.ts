export { canTransition, destinationOf } from './canTransition';
export type { CanTransitionInput, CanTransitionResult } from './canTransition';
export { EVENT_TYPE_TO_STATUS, mapEventToStatus, STATUS_TO_COMMAND } from './eventMapper';
export { ShipmentStateMachine } from './ShipmentStateMachine';
export { rankOf, STATUS_RANK } from './statusRank';
export { TRANSITION_TABLE } from './transitionTable';
export type { TransitionRule } from './transitionTable';
export { validateCreateShipmentInput } from './validation';
export type { ValidationError, ValidationResult } from './validation';
