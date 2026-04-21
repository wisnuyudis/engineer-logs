import { createContext, useContext } from 'react';

export const TaxonomyContext = createContext({});
export const useTaxonomy = () => useContext(TaxonomyContext);
