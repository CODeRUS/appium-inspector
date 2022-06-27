import React, { Component } from 'react';
import { Input, Select, Row } from 'antd';
import InspectorStyles from './Inspector.css';
import { withTranslation } from '../../util';

const { Option } = Select;

class ElementLocator extends Component {

  onSubmit () {
    const {locatedElements, locatorTestStrategy, locatorTestValue, searchForElement, clearSearchResults, hideLocatorTestModal} = this.props;
    if (locatedElements) {
      hideLocatorTestModal();
      clearSearchResults();
    } else {
      searchForElement(locatorTestStrategy, locatorTestValue);
    }
  }

  onCancel () {
    const {hideLocatorTestModal, clearSearchResults} = this.props;
    hideLocatorTestModal();
    clearSearchResults();
  }

  render () {
    const {
      setLocatorTestValue,
      locatorTestValue,
      setLocatorTestStrategy,
      locatorTestStrategy,
      t,
    } = this.props;

    const locatorStrategies = [
      ['text', 'Text'],
      ['className', 'Class Name'],
      ['objectName', 'Object Name'],
    ];

    return <div>
      <Row>
        {t('locatorStrategy')}
        <Select className={InspectorStyles['locator-strategy-selector']}
          onChange={(value) => setLocatorTestStrategy(value)}
          value={locatorTestStrategy}>
          {locatorStrategies.map(([strategyValue, strategyName]) => (
            <Option key={strategyValue} value={strategyValue}>{strategyName}</Option>
          ))}
        </Select>
      </Row>
      <Row>
        {t('selector')}
        <Input.TextArea className={InspectorStyles['locator-strategy-selector']} onChange={(e) => setLocatorTestValue(e.target.value)} value={locatorTestValue} />
      </Row>
    </div>;
  }
}

export default withTranslation(ElementLocator);
