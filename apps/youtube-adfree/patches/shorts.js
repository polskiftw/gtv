import { configRead } from './config';
import { removeShortsEverywhere } from './shorts-filter';

const origParse = JSON.parse;

JSON.parse = function () {
  const response = origParse.apply(this, arguments);
  if (configRead('removeShorts')) {
    removeShortsEverywhere(response);
  }
  return response;
};
