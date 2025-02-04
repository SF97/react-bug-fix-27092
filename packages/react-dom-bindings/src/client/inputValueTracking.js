/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import {checkFormFieldValueStringCoercion} from 'shared/CheckStringCoercion';

type ValueTracker = {
  getValue(): string,
  setValue(value: string): void,
  stopTracking(): void,
};
interface ElementWithValueTracker extends HTMLInputElement {
  _valueTracker?: ?ValueTracker;
}

function isCheckable(elem: HTMLInputElement) {
  const type = elem.type;
  const nodeName = elem.nodeName;
  return (
    nodeName &&
    nodeName.toLowerCase() === 'input' &&
    (type === 'checkbox' || type === 'radio')
  );
}

function getTracker(node: ElementWithValueTracker) {
  return node._valueTracker;
}

function detachTracker(node: ElementWithValueTracker) {
  node._valueTracker = null;
}

function getValueFromNode(node: HTMLInputElement): string {
  let value = '';
  if (!node) {
    return value;
  }

  if (isCheckable(node)) {
    value = node.checked ? 'true' : 'false';
  } else {
    value = node.value;
  }

  return value;
}

function trackValueOnNode(node: any): ?ValueTracker {
  const valueField = isCheckable(node) ? 'checked' : 'value';
  const descriptor = Object.getOwnPropertyDescriptor(
    node.constructor.prototype,
    valueField,
  );

  if (__DEV__) {
    checkFormFieldValueStringCoercion(node[valueField]);
  }
  let currentValue = '' + node[valueField];

  // if someone has already defined a value or Safari, then bail
  // and don't track value will cause over reporting of changes,
  // but it's better then a hard failure
  // (needed for certain tests that spyOn input values and Safari)
  if (
    node.hasOwnProperty(valueField) ||
    typeof descriptor === 'undefined' ||
    typeof descriptor.get !== 'function' ||
    typeof descriptor.set !== 'function'
  ) {
    return;
  }
  const {get, set} = descriptor;
  Object.defineProperty(node, valueField, {
    configurable: true,
    // $FlowFixMe[missing-this-annot]
    get: function () {
      const currentDescriptor = Object.getOwnPropertyDescriptor(
        node.constructor.prototype,
        valueField,
      );

      // Fall back to descriptor stored at installation time when there is no current descriptor
      if (!currentDescriptor || !currentDescriptor.get) {
        return get.call(this);
      }

      return currentDescriptor.get.call(this);
    },
    // $FlowFixMe[missing-local-annot]
    // $FlowFixMe[missing-this-annot]
    set: function (value) {
      if (__DEV__) {
        checkFormFieldValueStringCoercion(value);
      }
      currentValue = '' + value;
      const currentDescriptor = Object.getOwnPropertyDescriptor(
        node.constructor.prototype,
        valueField,
      );

      // Fall back to descriptor stored at installation time when there is no current descriptor
      if (!currentDescriptor || !currentDescriptor.set) {
        set.call(this, value);
        return;
      }

      currentDescriptor.set.call(this, value);
    },
  });
  // We could've passed this the first time
  // but it triggers a bug in IE11 and Edge 14/15.
  // Calling defineProperty() again should be equivalent.
  // https://github.com/facebook/react/issues/11768
  Object.defineProperty(node, valueField, {
    enumerable: descriptor.enumerable,
  });

  const tracker = {
    getValue() {
      return currentValue;
    },
    setValue(value: string) {
      if (__DEV__) {
        checkFormFieldValueStringCoercion(value);
      }
      currentValue = '' + value;
    },
    stopTracking() {
      detachTracker(node);
      delete node[valueField];
    },
  };
  return tracker;
}

export function track(node: ElementWithValueTracker) {
  if (getTracker(node)) {
    return;
  }

  node._valueTracker = trackValueOnNode(node);
}

export function updateValueIfChanged(node: ElementWithValueTracker): boolean {
  if (!node) {
    return false;
  }

  const tracker = getTracker(node);
  // if there is no tracker at this point it's unlikely
  // that trying again will succeed
  if (!tracker) {
    return true;
  }

  const lastValue = tracker.getValue();
  const nextValue = getValueFromNode(node);
  if (nextValue !== lastValue) {
    tracker.setValue(nextValue);
    return true;
  }
  return false;
}

export function stopTracking(node: ElementWithValueTracker) {
  const tracker = getTracker(node);
  if (tracker) {
    tracker.stopTracking();
  }
}
